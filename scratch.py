import json

def build_instruction() -> str:
    schema_path = "/Users/apple/project/first-project/backend/src/schema/meta_data.json"
    with open(schema_path, "r", encoding="utf-8") as f:
        meta_data = json.load(f)
    
    system_prompt = meta_data.get("system", "")
    
    # Strip some unneeded keys for the prompt JSON
    meta_schema_only = dict(meta_data)
    for k in ["system", "examples", "audit_requirements", "list_policy", "$schema", "$id"]:
        meta_schema_only.pop(k, None)
    
    schema_definition = {
        "type": "object",
        "properties": {
            "result": meta_schema_only,
            "audit": {
                "type": "object",
                "properties": {
                    "fields": {
                        "type": "object",
                        "description": "每个字段的审计信息"
                    }
                }
            }
        },
        "required": ["result", "audit"]
    }
    
    schema_str = json.dumps(schema_definition, ensure_ascii=False, indent=2)
    instruction = system_prompt.replace(
        "【JSON Schema】\n见json_schema字段的完整定义。\n",
        f"【JSON Schema】\n{schema_str}\n"
    )
    return instruction

print(build_instruction()[:500])
print("...")
print(build_instruction()[-500:])
