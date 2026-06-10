# EACY Pancreatic Cancer Extraction

Use this skill when the schema or OCR mentions pancreatic cancer, pancreas, 胰腺, 胰头, 胰体尾, 胰腺导管腺癌, IPMN, CA19-9, ERCP, EUS, Whipple, 胰十二指肠切除, 放化疗, 靶向, 免疫, 病理, 分期, 转移, 复发, or similar oncology terms.

Domain hints:
- Diagnosis aliases: 胰腺癌, 胰腺恶性肿瘤, 胰腺导管腺癌, pancreatic adenocarcinoma, PDAC.
- Tumor site aliases: 胰头, 胰体, 胰尾, 胰体尾, 钩突.
- Surgery aliases: Whipple, 胰十二指肠切除, distal pancreatectomy, 胰体尾切除, 全胰切除.
- Pathology: 分化程度, 腺癌, 神经侵犯, 脉管癌栓, 切缘, 淋巴结, pTNM.
- Imaging: CT/MRI/EUS/超声 can support lesion size, vascular invasion, metastasis, lymph nodes.
- Biomarkers: CA19-9, CEA, CA125, bilirubin. Preserve units in evidence, but numeric fields should use numeric value only.
- Treatment: FOLFIRINOX, gemcitabine/nab-paclitaxel, 吉西他滨, 白蛋白紫杉醇, 放疗, 化疗, 免疫, 靶向.

Extraction discipline:
- Do not infer pancreatic cancer stage unless the OCR explicitly states stage/TNM or provides a schema field whose prompt asks for derived staging.
- If multiple dates exist, use evidence tied to the requested field, e.g. diagnosis date vs surgery date vs report date.
- If there are conflicting values across sections, output the best supported value and record the conflict in `conflict_fields`.
- Keep pathology and imaging evidence separate when possible.
