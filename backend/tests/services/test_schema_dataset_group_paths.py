from app.services.schema_field_planner import schema_dataset_group_paths


def test_schema_dataset_group_paths_nested_groups():
    schema = {
        "properties": {
            "folder_a": {
                "title": "Folder A",
                "properties": {
                    "group_1": {
                        "properties": {
                            "field_x": {"type": "string"},
                            "field_y": {"type": "number"},
                        }
                    }
                },
            }
        }
    }
    groups = schema_dataset_group_paths(schema)
    assert "folder_a/group_1" in groups
    assert groups["folder_a/group_1"] == {"folder_a.group_1.field_x", "folder_a.group_1.field_y"}


def test_schema_dataset_group_paths_single_folder():
    schema = {
        "properties": {
            "basic_info": {
                "properties": {
                    "name": {"type": "string"},
                    "age": {"type": "integer"},
                }
            }
        }
    }
    groups = schema_dataset_group_paths(schema)
    assert "basic_info" in groups
    assert groups["basic_info"] == {"basic_info.name", "basic_info.age"}
