"""Database isolation for this copied checkout; never fall back to the original."""
from pathlib import Path

from dotenv import dotenv_values

TEST_DATABASE = "final_project_v2_test"
TEST_USER = "feedback_preview"


def get_test_db_config():
    # Read this checkout explicitly, so inherited shell variables cannot select production.
    values = dotenv_values(Path(__file__).resolve().parent / ".env")
    if values.get("DB_NAME") != TEST_DATABASE or values.get("DB_USER") != TEST_USER:
        raise RuntimeError("This backup only permits final_project_v2_test with feedback_preview.")
    return {
        "host": values.get("DB_HOST", "localhost"),
        "user": TEST_USER,
        "password": values.get("DB_PASSWORD", ""),
        "database": TEST_DATABASE,
        "charset": "utf8mb4",
        "collation": "utf8mb4_0900_ai_ci",
        "autocommit": False,
    }
