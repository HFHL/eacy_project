# 从 demo 复制缺失的 SchemaForm 文件

线上版本 (front1) 的 SchemaForm 已部分就绪，还差 **2 个文件** 需要从 **根目录 demo** 复制过来：

## 需要复制的文件

将以下文件从 **项目根目录** `src/components/SchemaForm/` 复制到 **front1** `front1/src/components/SchemaForm/`：

1. **SchemaForm.jsx**（主组件，约 950 行）
2. **CategoryTree.jsx**（目录树，约 714 行）

## 复制方式

在项目根目录 `prototype_01 copy` 下执行（PowerShell 或 CMD）：

```powershell
# 进入项目根目录
cd "E:\eacy\开发者指南-forSW\开发者指南\参考组件-渲染相关\prototype_01 copy"

# 复制
Copy-Item "src\components\SchemaForm\SchemaForm.jsx" -Destination "front1\src\components\SchemaForm\SchemaForm.jsx" -Force
Copy-Item "src\components\SchemaForm\CategoryTree.jsx" -Destination "front1\src\components\SchemaForm\CategoryTree.jsx" -Force
```

或使用 Windows 资源管理器：从 `src\components\SchemaForm\` 复制上述两个文件到 `front1\src\components\SchemaForm\`。

## 已完成的修改

- **PatientDetail**：已新增 Tab「电子病历 Schema版本」（使用 SchemaEhrTab），原「电子病历」已改名为「电子病历(旧版)」。
- **SchemaEhrTab**：Schema 路径已改为 `front1/src/data/patient_ehr-V2.schema.json`；无 mock 数据时使用空对象。
- **SchemaForm 组件**：`index.jsx`、`SchemaFormContext.jsx`、`FieldRenderer.jsx`、`FormPanel.jsx`、`RepeatableForm.jsx` 已在 front1 中创建/写入。

复制完上述 2 个文件后，「电子病历 Schema版本」Tab 即可正常使用。
