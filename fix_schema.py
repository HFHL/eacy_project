import json
import sqlite3

json_path = "frontend/src/data/patient_ehr-V2.schema.json"
with open(json_path, "r", encoding="utf-8") as f:
    schema = json.load(f)

group = schema["properties"]["影像检查"]["properties"]["PET-CT/PET-MR"]
group["x-sources"] = {
    "primary": ["PET-CT检查", "PET-MR检查"],
    "secondary": ["出院小结/记录", "24小时出入院记录", "入院记录", "综合病历"]
}

with open(json_path, "w", encoding="utf-8") as f:
    json.dump(schema, f, ensure_ascii=False, indent=2)

conn = sqlite3.connect("backend/eacy.db")
c = conn.cursor()
c.execute("UPDATE schemas SET content_json = ?, updated_at = datetime('now') WHERE schema_type = 'ehr' AND code = 'patient_ehr_v2'", (json.dumps(schema, ensure_ascii=False),))
conn.commit()
conn.close()
print("Fixed PET-CT/PET-MR sources.")
