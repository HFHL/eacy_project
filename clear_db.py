from dotenv import load_dotenv
import os
from psycopg import connect
from pathlib import Path

ROOT_DIR = Path("/Users/apple/project/first-project")
load_dotenv(ROOT_DIR / ".env")

db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("NO DB URL")
else:
    # psycopg expects standard postgresql://
    db_url = db_url.replace("+asyncpg", "")
    with connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM documents")
        conn.commit()
    print("All documents cleared.")
