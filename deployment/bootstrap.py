"""Initialize an EMPTY cloud test database once; never overwrite existing data."""
import json
import os
from pathlib import Path

import mysql.connector

from db_config import get_db_config


def initialize():
    if os.environ.get("DEPLOYMENT_MODE") != "cloud-test":
        raise RuntimeError("Bootstrap only runs against an isolated cloud test database.")
    config = get_db_config()
    conn = mysql.connector.connect(**config)
    cursor = conn.cursor()
    locked = False
    try:
        cursor.execute("SELECT GET_LOCK('feedback_test_bootstrap', 60)")
        locked = cursor.fetchone()[0] == 1
        if not locked:
            raise RuntimeError("Could not acquire database initialization lock.")
        cursor.execute("SHOW TABLES")
        existing = {row[0] for row in cursor.fetchall()}
        if "deployment_metadata" in existing:
            cursor.execute("SELECT value FROM deployment_metadata WHERE name='initialized'")
            if cursor.fetchone() == ("yes",):
                print("Cloud test database already initialized; all data preserved.")
                return
        snapshot_path = Path(os.environ.get("TEST_SNAPSHOT_PATH", str(Path(__file__).with_name("test_snapshot.json"))))
        snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
        if snapshot["database"] != config["database"]:
            raise RuntimeError("Snapshot database does not match the cloud test database.")
        allowed = {t["name"] for t in snapshot["tables"]}
        if not existing.issubset(allowed | {"deployment_metadata"}):
            raise RuntimeError("Unexpected tables; refusing to initialize.")
        for table in sorted(existing - {"deployment_metadata"}):
            cursor.execute(f"SELECT COUNT(*) FROM `{table}`")
            if cursor.fetchone()[0]:
                raise RuntimeError("Unmarked database contains data; refusing to overwrite it.")
        cursor.execute("SET SESSION FOREIGN_KEY_CHECKS=0")
        for table in snapshot["tables"]:
            if table["name"] not in allowed:
                raise RuntimeError("Unexpected snapshot table.")
            cursor.execute(table["ddl"].replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", 1))
        cursor.execute("CREATE TABLE IF NOT EXISTS deployment_metadata (name VARCHAR(64) PRIMARY KEY, value VARCHAR(255) NOT NULL)")
        conn.commit()
        for table in snapshot["tables"]:
            if not table["rows"]:
                continue
            columns = ",".join("`" + col.replace("`", "``") + "`" for col in table["columns"])
            placeholders = ",".join(["%s"] * len(table["columns"]))
            cursor.executemany(f"INSERT INTO `{table['name']}` ({columns}) VALUES ({placeholders})", table["rows"])
            cursor.execute(f"SELECT COUNT(*) FROM `{table['name']}`")
            if cursor.fetchone()[0] != len(table["rows"]):
                raise RuntimeError("Imported row count does not match snapshot.")
        cursor.execute("INSERT INTO deployment_metadata (name,value) VALUES ('initialized','yes')")
        conn.commit()
        print("Isolated cloud test database initialized and row counts verified.")
    except Exception:
        conn.rollback()
        raise
    finally:
        if locked:
            cursor.execute("SELECT RELEASE_LOCK('feedback_test_bootstrap')")
            cursor.fetchone()
        cursor.close()
        conn.close()


if __name__ == "__main__":
    initialize()
