import os
import tempfile
import json
import requests
from flask import Flask, request, jsonify, render_template
import mysql.connector
from dotenv import load_dotenv
from datetime import datetime

# --- 1. 初始化與配置 ---
load_dotenv() 

API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={API_KEY}"

app = Flask(__name__)

# 資料庫連線
db = mysql.connector.connect(
    host="localhost",
    user="root",
    password=os.getenv("DB_PASSWORD"),
    database="final_project"
)
cursor = db.cursor(dictionary=True)

# --- 🛠️ AI 工具函數：查字典並組裝 Prompt ---
def get_ai_rules_prompt():
    try:
        cursor.execute("SELECT keyword, suggested_sentiment, suggested_category, note FROM ai_rules")
        rules = cursor.fetchall()
        
        if not rules:
            return "" # 如果沒設定規則，就回傳空字串
            
        prompt = "\n\n【HR 專家特別提醒（請優先考量以下規則）】\n"
        prompt += "我們發現員工留言中常有一些特殊用法。當你看到以下關鍵字時，請特別注意我們給予的建議，並結合前後文嚴謹判斷：\n"
        
        for r in rules:
            prompt += f"- 關鍵字「{r['keyword']}」：\n"
            if r['suggested_sentiment']:
                prompt += f"  > 建議情緒方向：可能偏向 {r['suggested_sentiment']}。\n"
            if r['suggested_category']:
                prompt += f"  > 建議歸類方向：極可能是 {r['suggested_category']}。\n"
            if r['note']:
                prompt += f"  > 專家備註：{r['note']}\n"
                
        return prompt
        
    except Exception as e:
        print("獲取 AI 規則失敗:", e)
        return "" # 如果資料庫出錯，就不要加載規則，避免整個分析壞掉
        
# --- 2. 顯示前端首頁 (剛才就是不小心丟了這段！) ---
@app.route("/")
def index():
    return render_template("index.html")

# --- 3. AI 核心分析函式 (加入溫暖回覆與進階分析) ---
# --- 3. AI 核心分析函式 (乾淨升級版) ---
def analyze_text(feedback_text, expert_rules=""):
    
    # 💡 (第一步被我們刪掉了，因為我們直接用傳進來的 expert_rules 就好！)

    # 1. 從資料庫撈取【歷史經典範例】(取最新 5 筆)
    try:
        cursor.execute("""
            SELECT f.feedback, a.sentiment_score, a.category, a.reasoning 
            FROM feedbacks f
            JOIN analysis_results a ON f.id = a.feedback_id
            WHERE a.is_classic = TRUE
            LIMIT 5
        """)
        examples_data = cursor.fetchall()
        examples_text = ""
        for ex in examples_data:
            examples_text += f"\n員工說：{ex['feedback']}\nHR判定分數：{ex['sentiment_score']}\n類別：{ex['category']}\n推理邏輯：{ex['reasoning']}\n---"
    except Exception as e:
        print("獲取經典範例失敗:", e)
        examples_text = ""

    # 2. 組裝【超級提示詞 Super Prompt】
    prompt = f"""
    你現在是一位專業、具備高度同理心的企業人資(HR)心理顧問。
    請根據以下「全域量表」與「HR 專家提醒」進行深度分析。

    【情緒評估量表】：
    - +5：極度熱愛 (如：最好的團隊、超愛公司)
    - +3 ~ +4：高度滿意 (如：專案順利、感謝主管)
    - +1 ~ +2：微小肯定 (如：今天便當不錯、小確幸)
    -  0：中立客觀 (如：下午要開會、明天請假)
    - -1 ~ -2：日常微詞 (如：冷氣太冷、系統稍慢)
    - -3 ~ -4：高壓力/倦怠 (如：天天加班崩潰、考績不公)
    - -5：重大危機 (如：言語暴力、職場霸凌、身心崩潰)

    {expert_rules}  # 👈 關鍵修改：直接把外面做好的專家說明書貼進來！

    【歷史經典判定參考】：
    {examples_text if examples_text else "尚無參考範例。"}

    ========================================
    【本次需分析的員工回饋】：
    "{feedback_text}"
    ========================================

    【任務要求】：
    1. 你必須先進行「深度思考 (reasoning)」，特別要注意識別「反諷」與「台灣職場黑話」。
    2. 若員工回饋中觸發了【HR 專家特別提醒】的關鍵字，請優先考量該專家的建議，並結合前後文判斷。
    3. 嚴格依照下方 JSON 格式回傳。
    4. ⚠️ 絕對不要輸出任何 Markdown 標記 (例如 ```json 符號)，不要任何開場白，請直接給純 JSON 字串！

    {{
        "reasoning": "解釋判斷邏輯，若應用了特殊規則或識別出反諷，請務必註明",
        "sentiment": "Positive/Negative/Neutral",
        "sentiment_score": 數字 (請從上方量表 -5 到 +5 中選擇),
        "category": "薪資福利/工作負載/人際關係與管理/硬體與環境/職涯發展/其他",
        "keywords": "擷取2-3個關鍵字",
        "reply": "約50字的暖心專業回覆"
    }}
    """

    response_schema = {
        "type": "OBJECT",
        "properties": {
            "reasoning": { "type": "STRING" },
            "sentiment": { "type": "STRING" },
            "sentiment_score": { "type": "INTEGER" },
            "category": { "type": "STRING" },
            "keywords": { "type": "STRING" },
            "reply": { "type": "STRING" }
        },
        "required": ["reasoning", "sentiment", "sentiment_score", "category", "keywords", "reply"]
    }

    payload = {
        "contents": [{ "parts": [{ "text": prompt }] }], # 👈 順便修復一個小錯誤：要傳 prompt 而不是 feedback_text
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": response_schema
        }
    }

    # 發送請求給 Gemini
    headers = {'Content-Type': 'application/json'}
    response = requests.post(GEMINI_API_URL, headers=headers, data=json.dumps(payload))
    
    if response.status_code != 200:
        raise Exception(f"API Error: {response.status_code} - {response.text}")

    api_result = response.json()
    json_text = api_result['candidates'][0]['content']['parts'][0]['text']
    analysis_data = json.loads(json_text)
    
    return (
        analysis_data.get("reasoning", ""),
        analysis_data.get("sentiment", "Neutral"),
        analysis_data.get("keywords", ""),
        analysis_data.get("reply", ""),
        analysis_data.get("sentiment_score", 0),
        analysis_data.get("category", "其他")
    )

# --- 4. 接收前端資料並儲存至 MySQL ---
@app.route("/api/analyze", methods=["POST"])
def analyze_feedback():
    try:
        data = request.get_json()
        feedback_text = data.get("feedback")
        employee_name = data.get("name") or f"Anonymous_{int(datetime.now().timestamp())}"
        dept_name = data.get("department")

        if not feedback_text:
            return jsonify({"success": False, "error": "No text"}), 400

        # 👇 1. 呼叫工具函數，從資料庫拿到「專家說明書」
        expert_rules = get_ai_rules_prompt()

        # 👇 2. 把說明書 (expert_rules) 當作第二個參數，傳給你的 AI 函數！
        reasoning, sentiment, keywords, reply, sentiment_score, category = analyze_text(feedback_text, expert_rules)

        # 寫入員工表
        cursor.execute("SELECT id FROM employees WHERE name=%s", (employee_name,))
        emp = cursor.fetchone()
        if not emp:
            cursor.execute("INSERT INTO employees (name) VALUES (%s)", (employee_name,))
            db.commit()
            employee_id = cursor.lastrowid
        else:
            employee_id = emp["id"]

        # 寫入回饋表
        now = datetime.now()
        cursor.execute("INSERT INTO feedbacks (employee_id, feedback, department, created_at) VALUES (%s, %s, %s, %s)", (employee_id, feedback_text, dept_name, now))
        db.commit()
        feedback_id = cursor.lastrowid

        # 👇 2. 這裡大更新！把 reasoning 加進 SQL 語法，VALUES 裡的 %s 變成 7 個
        cursor.execute(
            "INSERT INTO analysis_results (feedback_id, sentiment, original_sentiment, sentiment_score, category, reasoning) VALUES (%s, %s, %s, %s, %s, %s)",
            (feedback_id, sentiment, sentiment, sentiment_score, category, reasoning)
        )
        db.commit()

        # 關鍵點：回傳給網頁的資料依然「只有」 Reply，把 reasoning 藏在後端
        return jsonify({
            "success": True, 
            "data": {
                "Reply": reply
            }
        })
    except Exception as e:
        print("Analyze error:", e)
        return jsonify({"success": False, "error": str(e)}), 500

# --- 5. HR 管理後台 API：取得所有回饋清單 ---
@app.route("/api/admin/feedbacks", methods=["GET"])
def get_admin_feedbacks():
    try:
        # 👇 [魔法 1] 每次載入表格前，先偷偷把「超過三天」的垃圾倒掉！
        # 必須先刪除子表 (analysis_results)
        cursor.execute("""
            DELETE FROM analysis_results 
            WHERE feedback_id IN (SELECT id FROM feedbacks WHERE deleted_at <= NOW() - INTERVAL 3 DAY)
        """)
        # 再刪除主表 (feedbacks)
        cursor.execute("""
            DELETE FROM feedbacks WHERE deleted_at <= NOW() - INTERVAL 3 DAY
        """)
        db.commit()

        # 👇 [魔法 2] 聯合查詢，而且只撈取「還沒被刪除 (deleted_at IS NULL)」的資料
        cursor.execute("""
            SELECT 
                f.id, 
                DATE_FORMAT(f.created_at, '%Y/%m/%d %H:%i') as created_at,
                f.department,
                f.feedback,
                a.sentiment,
                a.original_sentiment,
                a.sentiment_score,
                a.category,
                a.reasoning,
                a.is_classic
            FROM feedbacks f
            LEFT JOIN analysis_results a ON f.id = a.feedback_id
            WHERE f.deleted_at IS NULL  -- 👈 關鍵！把被蓋過刪除印章的藏起來
            ORDER BY f.created_at DESC
        """)
        results = cursor.fetchall()
        
        return jsonify({"success": True, "data": results})
    except Exception as e:
        print("Admin API Error:", e)
        return jsonify({"success": False, "error": str(e)}), 500

# --- 6. HR 後台 API：刪除垃圾回饋 (升級為「軟刪除」) ---
@app.route("/api/admin/feedbacks/<int:feedback_id>", methods=["DELETE"])
def delete_feedback(feedback_id):
    try:
        # 這次我們不真的刪除，而是幫它蓋上一個「現在時間」的印章
        now = datetime.now()
        
        # 只需要更新 feedbacks 表就好，不用管 analysis_results，因為資料還沒真正消失
        cursor.execute("UPDATE feedbacks SET deleted_at = %s WHERE id = %s", (now, feedback_id))
        db.commit()
        
        return jsonify({"success": True})
    except Exception as e:
        db.rollback() # 發生錯誤就退回，保護資料庫
        print("Delete Error:", e)
        return jsonify({"success": False, "error": str(e)}), 500

# --- 7. HR 後台 API：切換「經典範例」狀態 ---
@app.route("/api/admin/feedbacks/<int:feedback_id>/classic", methods=["PUT"])
def toggle_classic(feedback_id):
    try:
        # SQL 魔法：使用 NOT is_classic，按一下變 TRUE，再按一下變 FALSE
        cursor.execute("UPDATE analysis_results SET is_classic = NOT is_classic WHERE feedback_id = %s", (feedback_id,))
        db.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

# --- 8. HR 後台 API：人工校正 AI 情緒 ---
@app.route("/api/admin/feedbacks/<int:feedback_id>/sentiment", methods=["PUT"])
def update_sentiment(feedback_id):
    try:
        data = request.get_json()
        new_sentiment = data.get("sentiment")
        
        # 👇 直接把新的情緒覆蓋過去就好，不碰 reasoning 了！
        cursor.execute("UPDATE analysis_results SET sentiment = %s WHERE feedback_id = %s", (new_sentiment, feedback_id))
        db.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

# --- 9. AI 規則：獲取清單 (GET) ---
@app.route("/api/admin/rules", methods=["GET"])
def get_rules():
    try:
        cursor.execute("SELECT id, keyword, suggested_sentiment, suggested_category, note FROM ai_rules")
        rules = cursor.fetchall()
        return jsonify({"success": True, "data": rules})
    except Exception as e:
        print("獲取規則清單失敗:", e)
        return jsonify({"success": False, "error": str(e)}), 500

# --- 10. AI 規則：刪除規則 (DELETE) ---
@app.route("/api/admin/rules/<int:rule_id>", methods=["DELETE"])
def delete_rule(rule_id):
    try:
        cursor.execute("DELETE FROM ai_rules WHERE id = %s", (rule_id,))
        db.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.rollback()
        print("刪除規則失敗:", e)
        return jsonify({"success": False, "error": str(e)}), 500

# --- 11. AI 規則：新增規則 (POST) ---
@app.route("/api/admin/rules", methods=["POST"])
def add_rule():
    data = request.json
    keyword = data.get("keyword")
    sentiment = data.get("sentiment")
    category = data.get("category") # 如果前端選了「交給AI判斷」，這裡會拿到空字串 ""

    if not keyword:
        return jsonify({"success": False, "error": "關鍵字不能為空"}), 400

    try:
        # 👇 動態組合給 AI 的提示備註
        if category:
            note = f"HR特別標記：請注意此關鍵字暗示 {sentiment} 情緒與 {category} 相關問題，請謹慎判斷。"
        else:
            note = f"HR特別標記：請注意此關鍵字暗示 {sentiment} 情緒，至於『回饋類別』請完全依照前後文來獨立判斷。"
        
        # 把空字串轉成 None，讓資料庫存成 NULL
        db_category = category if category else None

        cursor.execute(
            "INSERT INTO ai_rules (keyword, suggested_sentiment, suggested_category, note) VALUES (%s, %s, %s, %s)",
            (keyword, sentiment, db_category, note)
        )
        db.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.rollback()
        print("新增規則失敗:", e)
        return jsonify({"success": False, "error": "新增失敗，可能是關鍵字已存在！"}), 500

# --- 12. AI 規則：修改規則 (PUT) ---
@app.route("/api/admin/rules/<int:rule_id>", methods=["PUT"])
def update_rule(rule_id):
    data = request.json
    keyword = data.get("keyword")
    sentiment = data.get("sentiment")
    category = data.get("category") 

    if not keyword:
        return jsonify({"success": False, "error": "關鍵字不能為空"}), 400

    try:
        # 動態組合給 AI 的提示備註
        if category:
            note = f"HR特別標記：請注意此關鍵字暗示 {sentiment} 情緒與 {category} 相關問題，請謹慎判斷。"
        else:
            note = f"HR特別標記：請注意此關鍵字暗示 {sentiment} 情緒，至於『回饋類別』請完全依照前後文來獨立判斷。"
        
        db_category = category if category else None

        cursor.execute(
            "UPDATE ai_rules SET keyword=%s, suggested_sentiment=%s, suggested_category=%s, note=%s WHERE id=%s",
            (keyword, sentiment, db_category, note, rule_id)
        )
        db.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.rollback()
        print("修改規則失敗:", e)
        return jsonify({"success": False, "error": "修改失敗！"}), 500
# ==========================================
# 🗑️ 資源回收桶 API 區塊
# ==========================================

# --- 13. 回收桶：取得已刪除的資料 ---
@app.route("/api/admin/recycle", methods=["GET"])
def get_recycle_bin():
    try:
        # 關鍵：只撈取 deleted_at IS NOT NULL 的資料
        cursor.execute("""
            SELECT 
                f.id, 
                DATE_FORMAT(f.created_at, '%Y/%m/%d %H:%i') as created_at,
                DATE_FORMAT(f.deleted_at, '%Y/%m/%d %H:%i') as deleted_at,
                f.department,
                f.feedback,
                a.sentiment,
                a.category
            FROM feedbacks f
            LEFT JOIN analysis_results a ON f.id = a.feedback_id
            WHERE f.deleted_at IS NOT NULL
            ORDER BY f.deleted_at DESC
        """)
        results = cursor.fetchall()
        return jsonify({"success": True, "data": results})
    except Exception as e:
        print("Recycle Bin API Error:", e)
        return jsonify({"success": False, "error": str(e)}), 500

# --- 14. 回收桶：復原資料 (抹除刪除印章) ---
@app.route("/api/admin/recycle/<int:feedback_id>/restore", methods=["PUT"])
def restore_feedback(feedback_id):
    try:
        # 把 deleted_at 變回 NULL，資料就「復活」了！
        cursor.execute("UPDATE feedbacks SET deleted_at = NULL WHERE id = %s", (feedback_id,))
        db.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

# --- 15. 回收桶：永久刪除 (真正從資料庫拔除) ---
@app.route("/api/admin/recycle/<int:feedback_id>", methods=["DELETE"])
def hard_delete_feedback(feedback_id):
    try:
        # 這是真正的硬刪除，先刪子表，再刪主表
        cursor.execute("DELETE FROM analysis_results WHERE feedback_id = %s", (feedback_id,))
        cursor.execute("DELETE FROM feedbacks WHERE id = %s", (feedback_id,))
        db.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

# --- ??. 顯示管理後台網頁 ---
@app.route("/admin")
def admin_page():
    return render_template('admin.html') 
import base64

# ==========================================
# 🎙️ 接收語音檔並使用 Gemini 轉成文字 (STT)
# ==========================================
@app.route('/api/transcribe', methods=['POST'])
def transcribe_audio():
    # 1. 檢查前端有沒有乖乖把音檔傳過來
    if 'audio_file' not in request.files:
        return jsonify({'success': False, 'error': '沒有收到音檔'}), 400

    audio_file = request.files['audio_file']
    
    try:
        # 2. 將音檔轉換為 Base64 格式，因為 REST API 需要這種格式
        audio_data = audio_file.read()
        encoded_audio = base64.b64encode(audio_data).decode('utf-8')

        # 3. 準備發送給 Gemini 的 Payload
        prompt = "你是一個精準的聽寫機器人。請將這段語音轉成『繁體中文』逐字稿。如果裡面有夾雜英文，請照實打出。注意：請『直接輸出』內容，不要加上任何開場白、評論或括號註解。"
        
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inlineData": {
                                "mimeType": "audio/webm",
                                "data": encoded_audio
                            }
                        }
                    ]
                }
            ]
        }

        # 4. 發送請求給 Gemini (使用你原本設定的 API URL，但模型改用 flash)
        transcribe_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={API_KEY}"
        headers = {'Content-Type': 'application/json'}
        response = requests.post(transcribe_url, headers=headers, data=json.dumps(payload))
        
        if response.status_code != 200:
            raise Exception(f"API Error: {response.status_code} - {response.text}")

        # 5. 解析結果並回傳給前端
        api_result = response.json()
        transcript_text = api_result['candidates'][0]['content']['parts'][0]['text']

        return jsonify({
            'success': True,
            'text': transcript_text.strip()
        })

    except Exception as e:
        print(f"語音轉譯發生錯誤: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)

    