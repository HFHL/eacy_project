import json
import sqlite3

user_text = """
基本信息
人口学情况：首要来源是 病案首页、综合病历；次要来源是 出院小结/记录、24小时出入院记录、入院记录。
既往情况及家族史
健康情况：首要来源是 入院记录、综合病历；次要来源是 出院小结/记录、24小时出入院记录、病程记录、转科记录。
诊断记录
诊断记录：首要来源是 出院小结/记录、病案首页、综合病历；次要来源是 医疗证明、24小时出入院记录、急诊记录、诊断证明。
治疗情况
药物治疗：首要来源是 处方单、医嘱单、出院小结/记录、综合病历；次要来源是 24小时出入院记录、入院记录、病程记录、出院带药记录。
手术治疗：首要来源是 手术记录、综合病历；次要来源是 出院小结/记录、24小时出入院记录、入院记录。
外放射治疗：首要来源是 放疗记录、综合病历；次要来源是 出院小结/记录、24小时出入院记录、入院记录。
放射粒子植入（内放疗）：首要来源是 放疗记录、综合病历；次要来源是 出院小结/记录、24小时出入院记录、入院记录、病程记录。
置管情况：首要来源是 出院小结/记录、综合病历；次要来源是 24小时出入院记录、入院记录、病程记录。
其他治疗：首要来源是 出院小结/记录、综合病历；次要来源是 手术记录、24小时出入院记录、入院记录、病程记录。
病理
细胞学病理：首要来源是 细胞学检查、骨髓涂片；次要来源是 出院小结/记录、入院记录、综合病历。
活检组织病理：首要来源是 穿刺病理、骨髓活检；次要来源是 病理会诊、出院小结/记录、24小时出入院记录、出院带药记录、综合病历。
冰冻病理：首要来源是 冰冻病理；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
术后组织病理：首要来源是 手术病理；次要来源是 病理会诊、出院小结/记录、24小时出入院记录、入院记录、综合病历。
染色体分析：首要来源是 染色体分析；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
基因检测
基因突变/扩增/重排/融合及相关标志物检测：首要来源是 外泌体检测、NGS全外显子组测序、NGS靶向基因检测、NGS全基因组测序、组织DNA测序、组织RNA融合基因检测、单基因PCR检测、FISH检测、Sanger测序、DNA倍体分析检测、肿瘤免疫标志物检测、遗传病相关基因检测、芯片检测（SNP array / CNV）；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
DNA倍体分析检测：首要来源是 DNA倍体分析检测；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
循环肿瘤细胞（CTC）检测：首要来源是 循环肿瘤细胞检测；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
ctDNA检测：首要来源是 cfDNA 定量检测、ctDNA液体活检；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
影像检查
X线：首要来源是 X光检查、骨密度检测、乳腺钼靶摄影；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
CT：首要来源是 CT检查；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
MRI：首要来源是 MRI检查；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
PET-CT / PET-MR：首要来源是 PET-CT检查、PET-MR检查；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
超声：首要来源是 超声检查；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
骨扫描：首要来源是 骨扫描；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
内镜检查
胃肠镜检查：首要来源是 胃肠镜检查；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
支气管镜检查：首要来源是 支气管镜检查；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
喉镜检查：首要来源是 喉镜检查；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
特殊检查
其他检查：首要来源是 肺功能检查、心电图、脑电图、肌电图、诱发电位检查、动脉硬化检测、24小时动态心电图、动态血压监测、体位性血压监测、眼底检查、视力与视野检查、角膜地形图；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
实验室检查
血常规：首要来源是 血常规、综合检验报告；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
生化检查：首要来源是 生化检查、综合检验报告；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
血气分析：首要来源是 血气分析、综合检验报告；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
传染学检测：首要来源是 传染学检测、综合检验报告；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
免疫学检测：首要来源是 免疫细胞亚群检测、综合检验报告；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
肿瘤标志物：首要来源是 肿瘤标志物、综合检验报告；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
感染性指标：首要来源是 感染性指标、综合检验报告；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
血型：首要来源是 血型检测、综合检验报告；次要来源是 病案首页、入院记录、综合病历。
其他检测：首要来源是 尿常规、粪便常规及潜血、心肌标志物、感染性指标、凝血功能、甲状腺功能、激素水平检测、自身免疫抗体谱、传染学检测、微生物培养与药敏、骨代谢指标、炎症/免疫细胞因子检测、外泌体检测、综合检验报告；次要来源是 出院小结/记录、24小时出入院记录、入院记录、综合病历。
"""

updates = {}
current_folder = None
for line in user_text.split("\n"):
    line = line.strip()
    if not line:
        continue
    if "：" not in line:
        current_folder = line
    else:
        # e.g. 人口学情况：首要来源是 病案首页、综合病历；次要来源是 出院小结/记录、24小时出入院记录、入院记录。
        parts = line.split("：", 1)
        group = parts[0].strip()
        # The user provided "基因突变_扩增_重排_融合" in prompt but schema probably has original name.
        if "基因突变" in group:
            group = "基因突变/扩增/重排/融合及相关标志物检测"
        elif "PET-CT" in group:
            group = "PET-CT / PET-MR"
        sources_part = parts[1].strip()
        prim = []
        sec = []
        # split by ；
        for sp in sources_part.split("；"):
            sp = sp.strip().strip("。")
            if sp.startswith("首要来源是"):
                srcs = sp.replace("首要来源是", "").strip()
                prim = [s.strip() for s in srcs.split("、") if s.strip()]
            elif sp.startswith("次要来源是"):
                srcs = sp.replace("次要来源是", "").strip()
                sec = [s.strip() for s in srcs.split("、") if s.strip()]
        if current_folder not in updates:
            updates[current_folder] = {}
        updates[current_folder][group] = {"primary": prim, "secondary": sec}

# 1. Update the JSON file
json_path = "frontend/src/data/patient_ehr-V2.schema.json"
with open(json_path, "r", encoding="utf-8") as f:
    schema = json.load(f)

root = schema.get("properties", {})
not_found_groups = []
for folder_name, folder_data in updates.items():
    if folder_name not in root:
        print(f"Warning: folder {folder_name} not found")
        continue
    fprops = root[folder_name].get("properties", {})
    for group_name, sources in folder_data.items():
        if group_name not in fprops:
            not_found_groups.append(f"{folder_name} / {group_name}")
            continue
        gprop = fprops[group_name]
        gprop["x-sources"] = sources

if not_found_groups:
    print("WARNING! These groups were not found in the JSON schema:")
    for gn in not_found_groups:
        print(" ->", gn)

with open(json_path, "w", encoding="utf-8") as f:
    json.dump(schema, f, ensure_ascii=False, indent=2)
print("Updated JSON file.")

# 2. Update backend/eacy.db
conn = sqlite3.connect("backend/eacy.db")
c = conn.cursor()
c.execute("UPDATE schemas SET content_json = ?, updated_at = datetime('now') WHERE schema_type = 'ehr' AND code = 'patient_ehr_v2'", (json.dumps(schema, ensure_ascii=False),))
conn.commit()
conn.close()
print("Updated database.")
