import os
import json
from google import genai
from google.genai.errors import APIError

# 設置預設模型
MODEL_NAME = "gemini-2.5-flash"

def analyze_feedback(feedback: str, system_prompt: str) -> dict:
    """
    使用 Gemini API 分析員工回饋，提取情緒和關鍵字。
    """
    
    # 檢查 API Key
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return {"error": "GEMINI_API_KEY environment variable not set."}

    try:
        # 初始化 Gemini 客戶端
        client = genai.Client(api_key=api_key)

        # 定義期望的 JSON 輸出結構
        response_schema = {
            "type": "OBJECT",
            "properties": {
                "sentiment": {
                    "type": "STRING",
                    "description": "The overall sentiment: Positive, Negative, or Neutral."
                },
                "keywords": {
                    "type": "STRING",
                    "description": "Comma-separated keywords."
                }
            },
            "required": ["sentiment", "keywords"]
        }

        # 構造 API 呼叫的配置
        config = genai.types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=response_schema
        )

        # 呼叫 API 進行生成
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=feedback,
            config=config,
        )

        # 解析 JSON 響應
        json_string = response.text.strip()
        analysis_data = json.loads(json_string)
        
        return {
            "sentiment": analysis_data.get("sentiment", "Neutral"),
            "keywords": analysis_data.get("keywords", "")
        }

    except APIError as e:
        return {"error": f"Gemini API Error: {e}"}
    except json.JSONDecodeError as e:
        return {"error": f"Failed to parse JSON response: {e}"}
    except Exception as e:
        return {"error": f"An unexpected error occurred: {e}"}