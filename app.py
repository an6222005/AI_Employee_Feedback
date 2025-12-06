import os
import json
import requests
from flask import Flask, request, jsonify, render_template
import mysql.connector

db = mysql.connector.connect(
    host="localhost",
    user="root",
    password="A131984247",
    database="employee_feedback"
)

cursor = db.cursor(dictionary=True)

# 新增: 引入 load_dotenv 函式
from dotenv import load_dotenv
# 新增: 引入 datetime 模組
from datetime import datetime

# --- 1. 初始化與配置 ---
# 載入 .env 檔案中的環境變數
load_dotenv() 

# 注意: 在 Canvas 環境中，API Key 會被自動提供。在本地運行時，請確保您已在
# .env 檔案中設定 GEMINI_API_KEY。
API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025"
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={API_KEY}"

app = Flask(__name__)

# 模擬資料庫：由於您在本地環境運行，我們使用一個簡單的列表來模擬資料庫存儲。
# 在生產環境中，此處會使用 Firestore。


# --- 2. 應用程式路由 ---

@app.route("/")
def index():
    """渲染主 HTML 頁面。"""
    return render_template("index.html")

# ===============================================
# --- 3. 核心 AI 分析輔助函式 (新增與優化) ---
# ===============================================

def analyze_text(feedback_text):
    """
    執行 Gemini API 呼叫，分析回饋文本，返回情緒和關鍵詞。
    此邏輯現已被 analyze_feedback 和 update_record 共享。
    """
    # 1. 系統指令 (System Instruction): 包含負面傾向規則
    system_prompt = (
        "You are a sophisticated Employee Feedback Analyzer for a company. "
        "Your task is to analyze the provided employee feedback text for overall sentiment and extract the most relevant three to five keywords. "
        "The sentiment must be classified as 'Positive', 'Negative', or 'Neutral'. "
        
        # 關鍵規則：對於混合情緒，優先判斷為 Negative
        "**重要規則：針對中文回饋，如果內容包含「還可以但...」、「不錯但...」或任何暗示疲勞、壓力、不滿的詞語（例如：累、不好、慢、但），請務必將整體情緒分類為 'Negative'，以強調需要解決的潛在問題。**"
        "**Critical Rule:** For mixed sentiments (e.g., 'It's fine, but I'm tired'), the negative signal MUST take precedence. If the feedback contains *any* phrase indicating stress, fatigue, or dissatisfaction, the overall sentiment MUST be classified as 'Negative'."
        
        "Respond ONLY with a strict JSON object conforming to the provided schema. Do not include any other text, explanation, or markdown formatting outside of the JSON object itself."
    )

    # 2. JSON 模式 (Response Schema)
    response_schema = {
        "type": "OBJECT",
        "properties": {
            "Sentiment": { 
                "type": "STRING", 
                "description": "Overall sentiment: Positive, Negative, or Neutral." 
            },
            "Keywords": { 
                "type": "STRING", 
                "description": "A comma-separated list of 3-5 keywords (in the original language of the feedback) relevant to the feedback content, for example: workload, compensation, team morale." 
            }
        },
        "propertyOrdering": ["Sentiment", "Keywords"]
    }

    # 3. API 請求本體
    payload = {
        "contents": [{ "parts": [{ "text": feedback_text }] }],
        "systemInstruction": { "parts": [{ "text": system_prompt }] },
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": response_schema
        }
    }
    
    # 4. 進行 API 呼叫
    headers = {'Content-Type': 'application/json'}
    response = requests.post(GEMINI_API_URL, headers=headers, data=json.dumps(payload))
    response.raise_for_status() # 如果請求失敗 (例如 4xx, 5xx)，拋出異常
    
    # 5. 解析 API 回應
    api_result = response.json()
    json_text = api_result['candidates'][0]['content']['parts'][0]['text']
    analysis_data = json.loads(json_text)
    
    # 6. 返回分析結果
    sentiment = analysis_data.get("Sentiment")
    keywords = analysis_data.get("Keywords")

    if not sentiment or not keywords:
         raise ValueError("AI analysis failed to return required fields.")
         
    return sentiment, keywords


# --- 4. API 路由 (Create/分析) ---

@app.route("/api/analyze", methods=["POST"])
def analyze_feedback():
    try:
        data = request.get_json()
        feedback_text = data.get("feedback")

        employee_name = data.get("name")
        # If name is empty → generate unique anonymous name
        if not employee_name or employee_name.strip() == "":
            employee_name = f"Anonymous_{int(datetime.now().timestamp())}"


        if not feedback_text:
            return jsonify({"success": False, "error": "Feedback content is required."}), 400

        # ✅ AI 分析
        sentiment, keywords = analyze_text(feedback_text)

        # ✅ 1. 儲存 / 取得員工
        cursor.execute("SELECT id FROM employees WHERE name=%s", (employee_name,))
        emp = cursor.fetchone()

        if emp:
            employee_id = emp["id"]
        else:
            cursor.execute("INSERT INTO employees (name) VALUES (%s)", (employee_name,))
            db.commit()
            employee_id = cursor.lastrowid

        # ✅ 2. 儲存回饋
        now = datetime.now()
        cursor.execute(
            "INSERT INTO feedbacks (employee_id, feedback, created_at) VALUES (%s, %s, %s)",
            (employee_id, feedback_text, now)
        )
        db.commit()
        feedback_id = cursor.lastrowid

        # ✅ 3. 儲存分析結果
        cursor.execute(
            "INSERT INTO analysis_results (feedback_id, sentiment, keywords) VALUES (%s, %s, %s)",
            (feedback_id, sentiment, keywords)
        )
        db.commit()

        return jsonify({
            "success": True,
            "data": {
                "id": feedback_id,
                "Time": now.isoformat(),
                "Name": employee_name,
                "Feedback": feedback_text,
                "Sentiment": sentiment,
                "Keywords": keywords
            }
        })

    except Exception as e:
        print("Analyze error:", e)
        return jsonify({"success": False, "error": "Database or AI error"}), 500


# --- 5. API 路由 (歷史紀錄 CRUD - 使用模擬資料) ---

# 獲取歷史紀錄 (Read)
@app.route("/api/history", methods=["GET"])
def get_history():
    cursor.execute("""
        SELECT f.id, f.created_at AS Time, e.name AS Name,
               f.feedback AS Feedback, a.sentiment AS Sentiment, a.keywords AS Keywords
        FROM feedbacks f
        LEFT JOIN employees e ON f.employee_id = e.id
        LEFT JOIN analysis_results a ON f.id = a.feedback_id
        ORDER BY f.id DESC
    """)
    records = cursor.fetchall()
    return jsonify({"success": True, "data": records})



# 更新紀錄 (Update) ✅✅✅ 已修正會重新分析
@app.route("/api/history/<record_id>", methods=["PUT"])
def update_record(record_id):
    data = request.get_json()
    new_name = data.get("Name")
    new_feedback = data.get("Feedback")

    sentiment, keywords = analyze_text(new_feedback)

    cursor.execute("SELECT id FROM employees WHERE name=%s", (new_name,))
    emp = cursor.fetchone()

    if emp:
        emp_id = emp["id"]
    else:
        cursor.execute("INSERT INTO employees (name) VALUES (%s)", (new_name,))
        db.commit()
        emp_id = cursor.lastrowid

    cursor.execute(
        "UPDATE feedbacks SET employee_id=%s, feedback=%s WHERE id=%s",
        (emp_id, new_feedback, record_id)
    )

    cursor.execute(
        "UPDATE analysis_results SET sentiment=%s, keywords=%s WHERE feedback_id=%s",
        (sentiment, keywords, record_id)
    )

    db.commit()

    return jsonify({
        "success": True,
        "data": {
            "id": record_id,
            "Name": new_name,
            "Feedback": new_feedback,
            "Sentiment": sentiment,
            "Keywords": keywords
        }
    })



# 刪除紀錄 (Delete) ✅✅✅ 已修正型別問題
@app.route("/api/history/<record_id>", methods=["DELETE"])
def delete_record(record_id):
    cursor.execute("DELETE FROM analysis_results WHERE feedback_id=%s", (record_id,))
    cursor.execute("DELETE FROM feedbacks WHERE id=%s", (record_id,))
    db.commit()
    return jsonify({"success": True})


# --- 6. 運行應用程式 ---

if __name__ == "__main__":
    # 在本地運行時，請確保您已安裝 requests 和 python-dotenv 庫
    app.run(debug=True)