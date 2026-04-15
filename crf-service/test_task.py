import os
import faulthandler
faulthandler.enable()
import asyncio
from app.tasks import run_extraction_task

import threading
import sys
import traceback
import sqlite3

def dump_traceback():
    print("=== DUMPING THREADS ===")
    for thread_id, frame in sys._current_frames().items():
        print(f"\n--- Thread {thread_id} ---")
        traceback.print_stack(frame, file=sys.stdout)
    os._exit(1)

timer = threading.Timer(15.0, dump_traceback)
timer.start()

fake_id = "test_job_123"
with sqlite3.connect("../backend/eacy.db") as conn:
    conn.execute("INSERT OR REPLACE INTO ehr_extraction_jobs (id, status, document_id, patient_id, schema_id) VALUES (?, 'pending', '8c269e40-8629-4467-bd76-830621302215', '107d185d-ef40-43f0-8d55-2c3c63309b2c', 'd20b08fc-b73e-42cf-9c1b-8e89247c71f0')", (fake_id,))
    conn.commit()

print("Started task...")
run_extraction_task(
    job_id=fake_id,
    document_ids=["8c269e40-8629-4467-bd76-830621302215", "cb8ea7de-2f40-43f6-99b0-8e191708dddf"],  
    patient_id="107d185d-ef40-43f0-8d55-2c3c63309b2c",
    schema_id="d20b08fc-b73e-42cf-9c1b-8e89247c71f0",
    instance_type="patient_ehr"
)
print("Finished!")
timer.cancel()
