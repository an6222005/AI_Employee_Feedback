"""Keep local preview isolation and cloud test database isolation separate."""
import os
from pathlib import Path

from test_db_config import get_test_db_config


def get_db_config():
    if os.getenv("DEPLOYMENT_MODE") != "cloud-test":
        return get_test_db_config()

    host = os.environ["DB_HOST"].strip()
    if not host.endswith((".railway.internal", ".proxy.rlwy.net", ".aivencloud.com")):
        raise RuntimeError("Cloud test mode only permits an isolated cloud database host.")
    if os.environ.get("DB_NAME") != "final_project_v2_test":
        raise RuntimeError("Only the isolated test database is allowed.")
    if os.environ.get("DB_USER") != "feedback_preview":
        raise RuntimeError("Cloud connections must use the dedicated test user.")
    config = {
        "host": host,
        "port": int(os.environ.get("DB_PORT", "3306")),
        "user": "feedback_preview",
        "password": os.environ["DB_PASSWORD"],
        "database": "final_project_v2_test",
        "charset": "utf8mb4",
        "collation": "utf8mb4_0900_ai_ci",
        "autocommit": False,
        "connection_timeout": 15,
    }
    if host.endswith(".aivencloud.com"):
        ca_path = os.environ.get("DB_SSL_CA", str(Path(__file__).resolve().parent / "deployment" / "aiven-ca.pem"))
        if not Path(ca_path).is_file():
            raise RuntimeError("Aiven connections require the trusted project CA certificate.")
        config.update(ssl_ca=ca_path, ssl_verify_cert=True, ssl_verify_identity=True)
    return config
