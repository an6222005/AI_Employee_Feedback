from db_config import get_db_config

import json
import logging
import os
from datetime import datetime
from io import BytesIO

import mysql.connector
from mysql.connector import pooling
from flask import Flask, request, jsonify, render_template
from dotenv import load_dotenv
from google import genai
from google.genai import types

from utils.gemini_analyzer import analyze_text
from utils.backoff import run_with_backoff
from deployment.access import protect_cloud_site

# ============================================================
# 1. Configuration
# ============================================================

load_dotenv()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20 MB
protect_cloud_site(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

if not API_KEY:
    raise RuntimeError("GEMINI_API_KEY is missing from .env")

stt_client = genai.Client(api_key=API_KEY)

DB_CONFIG = get_db_config()
print("DEBUG DB_NAME =", DB_CONFIG["database"])
db_pool = pooling.MySQLConnectionPool(
    pool_name="employee_feedback_pool",
    pool_size=5,
    pool_reset_session=True,
    **DB_CONFIG,
)


def get_db_connection():
    """Get a connection from the MySQL connection pool."""
    return db_pool.get_connection()


def parse_json_list(value):
    """Normalize a MySQL JSON value into a Python list."""
    if value is None:
        return []

    if isinstance(value, list):
        return value

    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []

    return []


def json_list_for_db(value):
    """Serialize a list for insertion into a MySQL JSON column."""
    return json.dumps(
        value if isinstance(value, list) else [],
        ensure_ascii=False,
    )


def get_request_data():
    return request.get_json(silent=True) or {}


def make_error_response(message, status_code=400):
    return jsonify({"success": False, "error": message}), status_code


# ============================================================
# 2. HR reference rules and classic examples
# ============================================================

def get_ai_rules_prompt(conn):
    """Load HR rules as reference material, not absolute overrides."""
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT keyword, suggested_sentiment,
                   suggested_category, note
            FROM ai_rules
            ORDER BY id ASC
        """)
        rules = cursor.fetchall()

        if not rules:
            return ""

        lines = [
            "HR reference rules:",
            "Treat these as suggestions and evaluate the full context.",
        ]

        for rule in rules:
            lines.append(f"- Keyword: {rule['keyword']}")

            if rule["suggested_sentiment"]:
                lines.append(
                    f"  Suggested sentiment: "
                    f"{rule['suggested_sentiment']}"
                )

            if rule["suggested_category"]:
                lines.append(
                    f"  Suggested category: "
                    f"{rule['suggested_category']}"
                )

            if rule["note"]:
                lines.append(f"  HR note: {rule['note']}")

        return "\n".join(lines)

    finally:
        cursor.close()


def get_classic_examples(conn, limit=5):
    """Load recent, non-deleted examples marked as classic."""
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                f.feedback,
                a.original_sentiment,
                a.sentiment_score,
                a.category,
                a.reasoning
            FROM feedbacks f
            JOIN analysis_results a
                ON a.feedback_id = f.id
            WHERE a.is_classic = TRUE
              AND f.deleted_at IS NULL
            ORDER BY a.updated_at DESC, a.id DESC
            LIMIT %s
        """, (limit,))

        examples = cursor.fetchall()

        if not examples:
            return ""

        lines = [
            "Previous HR-reviewed reference examples:",
            "Use these as examples only; do not copy a label blindly.",
        ]

        for example in examples:
            lines.extend([
                f"Feedback: {example['feedback']}",
                f"Original AI sentiment: "
                f"{example['original_sentiment']}",
                f"Score: {example['sentiment_score']}",
                f"Category: {example['category']}",
                f"Evidence summary: {example['reasoning'] or ''}",
                "---",
            ])

        return "\n".join(lines)

    finally:
        cursor.close()


# ============================================================
# 3. Page routes
# ============================================================

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/healthz")
def healthz():
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        finally:
            cursor.close()
        return jsonify({"status": "ok"})
    finally:
        conn.close()


@app.route("/admin")
def admin_page():
    return render_template("admin.html")


@app.route("/dashboard")
def dashboard_page():
    return render_template("dashboard.html")


@app.route("/table")
def table_page():
    return render_template("table.html")


@app.route("/rules")
def rules_page():
    return render_template("airules.html")


@app.route("/recycle")
def recycle_page():
    return render_template("recycle.html")


# ============================================================
# 4. Analyze employee feedback and save all results
# ============================================================

@app.route("/api/analyze", methods=["POST"])
def analyze_feedback():
    data = get_request_data()

    feedback_text = data.get("feedback")
    employee_name = (data.get("name") or "").strip()
    department = (data.get("department") or "").strip() or None

    if not isinstance(feedback_text, str) or not feedback_text.strip():
        return make_error_response("Please enter your feedback.")

    feedback_text = feedback_text.strip()

    if len(feedback_text) > 10000:
        return make_error_response(
            "Feedback is too long. Please keep it under 10,000 characters."
        )

    if not employee_name:
        employee_name = f"Anonymous_{datetime.now().timestamp()}"

    if len(employee_name) > 255:
        return make_error_response("Name is too long.")

    if department and len(department) > 100:
        return make_error_response("Department is too long.")

    conn = None
    cursor = None

    try:
        # Get a database connection.
        conn = get_db_connection()

        # Read HR reference material.
        expert_rules = get_ai_rules_prompt(conn)
        classic_examples = get_classic_examples(conn)

        # Run Gemini analysis before writing to the database.
        try:
            result = analyze_text(
                feedback_text,
                expert_rules=expert_rules,
                classic_examples=classic_examples,
            )
        except Exception:
            if os.getenv("DEPLOYMENT_MODE") != "cloud-test":
                raise
            # A demonstration must still retain feedback when the AI provider
            # is unavailable. Leave analysis absent instead of inventing labels.
            logger.warning("AI unavailable; saving feedback without analysis.")
            result = None

        # Use the same database connection for the write operations.
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            "SELECT id FROM employees WHERE name = %s",
            (employee_name,),
        )
        employee = cursor.fetchone()

        if employee:
            employee_id = employee["id"]
        else:
            cursor.execute(
                "INSERT INTO employees (name) VALUES (%s)",
                (employee_name,),
            )
            employee_id = cursor.lastrowid

        cursor.execute("""
            INSERT INTO feedbacks (
        employee_id,
        feedback,
        department,
        feedback_date,
        is_demo
    )
    VALUES (
        %s,
        %s,
        %s,
        CURDATE(),
        0
    )
        """, (
    employee_id,
    feedback_text,
    department,
))

        feedback_id = cursor.lastrowid

        if result is None:
            conn.commit()
            return jsonify({
                "success": True,
                "data": {
                    "Reply": "回饋已儲存。AI 分析暫時無法完成，這筆回饋目前尚未分析。",
                    "analysis_status": "pending",
                },
            })

        cursor.execute("""
            INSERT INTO analysis_results (
                feedback_id,
                reasoning,
                sentiment,
                original_sentiment,
                sentiment_score,
                category,
                keywords,
                reply,
                valence_score,
                arousal_score,
                affective_state,
                job_demands,
                job_resources,
                strain_indicators,
                motivational_indicators,
                jdr_process,
                analysis_confidence
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
        """, (
            feedback_id,
            result["reasoning"],
            result["sentiment"],
            result["sentiment"],
            result["sentiment_score"],
            result["category"],
            json.dumps(
                result["keywords"],
                ensure_ascii=False,
            ),
            result["reply"],
            result["valence_score"],
            result["arousal_score"],
            result["affective_state"],
            json_list_for_db(result["job_demands"]),
            json_list_for_db(result["job_resources"]),
            json_list_for_db(result["strain_indicators"]),
            json_list_for_db(result["motivational_indicators"]),
            result["jdr_process"],
            result["analysis_confidence"],
        ))

        conn.commit()

        # Keep the existing frontend contract: result.data.Reply.
        return jsonify({
            "success": True,
            "data": {
                "Reply": result["reply"],
            },
        })

    except Exception:
        if conn and conn.is_connected():
            conn.rollback()

        logger.exception("Feedback analysis failed.")

        return jsonify({
            "success": False,
            "error": (
                "Analysis could not be completed. "
                "Please try again later."
            ),
        }), 500

    finally:
        if cursor:
            cursor.close()

        if conn and conn.is_connected():
            conn.close()


# ============================================================
# 5. Admin feedback list
# ============================================================

@app.route("/api/admin/feedbacks", methods=["GET"])
def get_admin_feedbacks():
    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Permanently remove feedbacks that have been in the recycle
        # bin for more than three days.
        # The foreign key cascades deletion to analysis_results.
        cursor.execute("""
            DELETE FROM feedbacks
            WHERE deleted_at IS NOT NULL
              AND deleted_at <= NOW() - INTERVAL 3 DAY
        """)
        conn.commit()

        cursor.execute("""
            SELECT
    f.id,

    DATE_FORMAT(
        f.created_at,
        '%Y/%m/%d %H:%i'
    ) AS created_at,

    DATE_FORMAT(
        COALESCE(
            f.feedback_date,
            DATE(f.created_at)
        ),
        '%Y/%m/%d'
    ) AS feedback_date,

    f.is_demo,
    f.department,
    f.feedback,

                COALESCE(
                    a.hr_corrected_sentiment,
                    a.sentiment
                ) AS sentiment,

                a.sentiment AS ai_sentiment,
                a.original_sentiment,
                a.hr_corrected_sentiment,
                a.sentiment_score,
                a.category,
                a.reasoning,
                a.keywords,
                a.reply,
                a.is_classic,

                a.valence_score,
                a.arousal_score,
                a.affective_state,
                a.job_demands,
                a.job_resources,
                a.strain_indicators,
                a.motivational_indicators,
                a.jdr_process,
                a.analysis_confidence

            FROM feedbacks f
            LEFT JOIN analysis_results a
                ON f.id = a.feedback_id
            WHERE f.deleted_at IS NULL
            ORDER BY f.created_at DESC
        """)

        results = cursor.fetchall()

        for item in results:
            item["keywords"] = parse_json_list(item["keywords"])
            item["job_demands"] = parse_json_list(item["job_demands"])
            item["job_resources"] = parse_json_list(
                item["job_resources"]
            )
            item["strain_indicators"] = parse_json_list(
                item["strain_indicators"]
            )
            item["motivational_indicators"] = parse_json_list(
                item["motivational_indicators"]
            )
            item["is_classic"] = bool(item["is_classic"])

        return jsonify({"success": True, "data": results})

    except Exception:
        logger.exception("Could not retrieve admin feedback.")

        return jsonify({
            "success": False,
            "error": "Could not load feedback records.",
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# ============================================================
# 6. Soft-delete feedback
# ============================================================

@app.route(
    "/api/admin/feedbacks/<int:feedback_id>",
    methods=["DELETE"],
)
def delete_feedback(feedback_id):
    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE feedbacks
            SET deleted_at = NOW()
            WHERE id = %s
              AND deleted_at IS NULL
        """, (feedback_id,))

        if cursor.rowcount == 0:
            conn.rollback()
            return make_error_response(
                "Feedback not found or already deleted.", 404
            )

        conn.commit()
        return jsonify({"success": True})

    except Exception:
        if conn and conn.is_connected():
            conn.rollback()

        logger.exception("Could not soft-delete feedback.")
        return make_error_response("Could not delete feedback.", 500)

    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# ============================================================
# 7. Toggle classic example
# ============================================================

@app.route(
    "/api/admin/feedbacks/<int:feedback_id>/classic",
    methods=["PUT"],
)
def toggle_classic(feedback_id):
    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE analysis_results a
            JOIN feedbacks f ON f.id = a.feedback_id
            SET a.is_classic = IF(a.is_classic = 1, 0, 1)
            WHERE a.feedback_id = %s
              AND f.deleted_at IS NULL
        """, (feedback_id,))

        if cursor.rowcount == 0:
            conn.rollback()
            return make_error_response(
                "Feedback analysis not found.", 404
            )

        conn.commit()
        return jsonify({"success": True})

    except Exception:
        if conn and conn.is_connected():
            conn.rollback()

        logger.exception("Could not update classic status.")
        return make_error_response(
            "Could not update classic status.", 500
        )

    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# ============================================================
# 8. HR correction of sentiment
# ============================================================

@app.route(
    "/api/admin/feedbacks/<int:feedback_id>/sentiment",
    methods=["PUT"],
)
def update_sentiment(feedback_id):
    data = get_request_data()
    new_sentiment = data.get("sentiment")

    valid_sentiments = {"Positive", "Neutral", "Negative"}

    if new_sentiment not in valid_sentiments:
        return make_error_response("Invalid sentiment value.")

    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Preserve the original AI output in sentiment/original_sentiment.
        # HR corrections are stored separately.
        cursor.execute("""
            UPDATE analysis_results a
            JOIN feedbacks f ON f.id = a.feedback_id
            SET a.hr_corrected_sentiment = %s
            WHERE a.feedback_id = %s
              AND f.deleted_at IS NULL
        """, (new_sentiment, feedback_id))

        if cursor.rowcount == 0:
            conn.rollback()
            return make_error_response(
                "Feedback analysis not found.", 404
            )

        conn.commit()
        return jsonify({"success": True})

    except Exception:
        if conn and conn.is_connected():
            conn.rollback()

        logger.exception("Could not update HR sentiment correction.")
        return make_error_response(
            "Could not save the HR correction.", 500
        )

    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# ============================================================
# 9. AI rules: list
# ============================================================

@app.route("/api/admin/rules", methods=["GET"])
def get_rules():
    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT id, keyword, suggested_sentiment,
                   suggested_category, note
            FROM ai_rules
            ORDER BY id DESC
        """)

        rules = cursor.fetchall()
        return jsonify({"success": True, "data": rules})

    except Exception:
        logger.exception("Could not retrieve AI rules.")
        return make_error_response("Could not load AI rules.", 500)

    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# ============================================================
# 10. AI rules: add
# ============================================================

def build_rule_note(sentiment, category):
    if category:
        return (
            f"HR reference: this keyword may suggest {sentiment} "
            f"sentiment and may relate to {category}. "
            "Evaluate the full context."
        )

    return (
        f"HR reference: this keyword may suggest {sentiment} sentiment. "
        "Determine the category from the full context."
    )


@app.route("/api/admin/rules", methods=["POST"])
def add_rule():
    data = get_request_data()

    keyword = (data.get("keyword") or "").strip()
    sentiment = (
        data.get("sentiment")
        or data.get("suggested_sentiment")
        or ""
    ).strip()
    category = (
        data.get("category")
        or data.get("suggested_category")
        or ""
    ).strip()

    if not keyword:
        return make_error_response("Keyword cannot be empty.")

    if len(keyword) > 100:
        return make_error_response("Keyword must be 100 characters or fewer.")

    if sentiment not in {"Positive", "Neutral", "Negative"}:
        return make_error_response("Invalid suggested sentiment.")

    allowed_categories = {
        "薪資福利",
        "工作負載",
        "人際關係與管理",
        "硬體與環境",
        "職涯發展",
        "其他",
    }

    if category and category not in allowed_categories:
        return make_error_response("Invalid suggested category.")

    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO ai_rules (
                keyword, suggested_sentiment,
                suggested_category, note
            )
            VALUES (%s, %s, %s, %s)
        """, (
            keyword,
            sentiment,
            category or None,
            build_rule_note(sentiment, category),
        ))

        conn.commit()
        return jsonify({"success": True})

    except mysql.connector.IntegrityError:
        if conn and conn.is_connected():
            conn.rollback()

        return make_error_response(
            "This keyword already exists.", 409
        )

    except Exception:
        if conn and conn.is_connected():
            conn.rollback()

        logger.exception("Could not add AI rule.")
        return make_error_response("Could not add AI rule.", 500)

    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# ============================================================
# 11. AI rules: update
# ============================================================

@app.route(
    "/api/admin/rules/<int:rule_id>",
    methods=["PUT"],
)
def update_rule(rule_id):
    data = get_request_data()

    keyword = (data.get("keyword") or "").strip()
    sentiment = (
        data.get("sentiment")
        or data.get("suggested_sentiment")
        or ""
    ).strip()
    category = (
        data.get("category")
        or data.get("suggested_category")
        or ""
    ).strip()

    if not keyword:
        return make_error_response("Keyword cannot be empty.")

    if len(keyword) > 100:
        return make_error_response("Keyword must be 100 characters or fewer.")

    if sentiment not in {"Positive", "Neutral", "Negative"}:
        return make_error_response("Invalid suggested sentiment.")

    allowed_categories = {
        "薪資福利",
        "工作負載",
        "人際關係與管理",
        "硬體與環境",
        "職涯發展",
        "其他",
    }

    if category and category not in allowed_categories:
        return make_error_response("Invalid suggested category.")

    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE ai_rules
            SET keyword = %s,
                suggested_sentiment = %s,
                suggested_category = %s,
                note = %s
            WHERE id = %s
        """, (
            keyword,
            sentiment,
            category or None,
            build_rule_note(sentiment, category),
            rule_id,
        ))

        if cursor.rowcount == 0:
            # Distinguish a missing rule from an unchanged update.
            cursor.execute(
                "SELECT id FROM ai_rules WHERE id = %s",
                (rule_id,),
            )
            if not cursor.fetchone():
                conn.rollback()
                return make_error_response("AI rule not found.", 404)

        conn.commit()
        return jsonify({"success": True})

    except mysql.connector.IntegrityError:
        if conn and conn.is_connected():
            conn.rollback()

        return make_error_response(
            "Another rule already uses this keyword.", 409
        )

    except Exception:
        if conn and conn.is_connected():
            conn.rollback()

        logger.exception("Could not update AI rule.")
        return make_error_response("Could not update AI rule.", 500)

    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# ============================================================
# 12. AI rules: delete
# ============================================================

@app.route(
    "/api/admin/rules/<int:rule_id>",
    methods=["DELETE"],
)
def delete_rule(rule_id):
    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute(
            "DELETE FROM ai_rules WHERE id = %s",
            (rule_id,),
        )

        if cursor.rowcount == 0:
            conn.rollback()
            return make_error_response("AI rule not found.", 404)

        conn.commit()
        return jsonify({"success": True})

    except Exception:
        if conn and conn.is_connected():
            conn.rollback()

        logger.exception("Could not delete AI rule.")
        return make_error_response("Could not delete AI rule.", 500)

    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# ============================================================
# 13. Recycle bin: list
# ============================================================

@app.route("/api/admin/recycle", methods=["GET"])
def get_recycle_bin():
    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                f.id,
                DATE_FORMAT(
                    f.created_at, '%Y/%m/%d %H:%i'
                ) AS created_at,
                DATE_FORMAT(
                    f.deleted_at, '%Y/%m/%d %H:%i'
                ) AS deleted_at,
                f.department,
                f.feedback,
                COALESCE(
                    a.hr_corrected_sentiment,
                    a.sentiment
                ) AS sentiment,
                a.category
            FROM feedbacks f
            LEFT JOIN analysis_results a
                ON f.id = a.feedback_id
            WHERE f.deleted_at IS NOT NULL
            ORDER BY f.deleted_at DESC
        """)

        return jsonify({
            "success": True,
            "data": cursor.fetchall(),
        })

    except Exception:
        logger.exception("Could not retrieve recycle bin.")
        return make_error_response(
            "Could not load recycle bin.", 500
        )

    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# ============================================================
# 14. Recycle bin: restore
# ============================================================

@app.route(
    "/api/admin/recycle/<int:feedback_id>/restore",
    methods=["PUT"],
)
def restore_feedback(feedback_id):
    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE feedbacks
            SET deleted_at = NULL
            WHERE id = %s
              AND deleted_at IS NOT NULL
        """, (feedback_id,))

        if cursor.rowcount == 0:
            conn.rollback()
            return make_error_response(
                "Deleted feedback not found.", 404
            )

        conn.commit()
        return jsonify({"success": True})

    except Exception:
        if conn and conn.is_connected():
            conn.rollback()

        logger.exception("Could not restore feedback.")
        return make_error_response("Could not restore feedback.", 500)

    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# ============================================================
# 15. Recycle bin: permanently delete
# ============================================================

@app.route(
    "/api/admin/recycle/<int:feedback_id>",
    methods=["DELETE"],
)
def hard_delete_feedback(feedback_id):
    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            DELETE FROM feedbacks
            WHERE id = %s
              AND deleted_at IS NOT NULL
        """, (feedback_id,))

        if cursor.rowcount == 0:
            conn.rollback()
            return make_error_response(
                "Deleted feedback not found.", 404
            )

        # analysis_results is deleted automatically through
        # the foreign key ON DELETE CASCADE.
        conn.commit()
        return jsonify({"success": True})

    except Exception:
        if conn and conn.is_connected():
            conn.rollback()

        logger.exception("Could not permanently delete feedback.")
        return make_error_response(
            "Could not permanently delete feedback.", 500
        )

    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# ============================================================
# 16. Voice transcription
# ============================================================

@app.route("/api/transcribe", methods=["POST"])
def transcribe_audio():
    audio_file = request.files.get("audio_file")

    if audio_file is None:
        return make_error_response("No audio file was received.")

    audio_bytes = audio_file.read()

    if not audio_bytes:
        return make_error_response("The audio file is empty.")

    # The current frontend records audio/webm.
    mime_type = audio_file.mimetype or "audio/webm"

    if mime_type not in {
        "audio/webm",
        "audio/ogg",
        "audio/wav",
        "audio/mpeg",
        "audio/mp4",
    }:
        return make_error_response("Unsupported audio format.")

    prompt = (
        "Transcribe the audio accurately into Traditional Chinese. "
        "Preserve any spoken English words in English. "
        "Return only the transcript, without an introduction, "
        "commentary, or extra quotation marks."
    )

    try:
        def _transcribe():
            return stt_client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[
                    prompt,
                    types.Part.from_bytes(
                        data=audio_bytes,
                        mime_type=mime_type,
                    ),
                ],
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    max_output_tokens=3000,
                ),
            )

        response = run_with_backoff(_transcribe)
        transcript = (response.text or "").strip()

        if not transcript:
            return make_error_response(
                "No speech could be transcribed.", 422
            )

        return jsonify({
            "success": True,
            "text": transcript,
        })

    except Exception:
        logger.exception("Audio transcription failed.")

        return jsonify({
            "success": False,
            "error": (
                "Transcription failed. Please try again "
                "or enter your feedback manually."
            ),
        }), 500


# ============================================================
# 17. Run the application
# ============================================================

if __name__ == "__main__":
    # Debug mode is for local development only.
    app.run(host="127.0.0.1", port=5001, debug=True)
