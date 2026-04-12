import { Router, Request, Response } from 'express'
import db from '../db.js'

const router = Router({ mergeParams: true })

router.get('/groups', (req: Request, res: Response) => {
  const batchId = (req.query.batchId as string) || null;
  const includeArchived = req.query.includeArchived === 'true';
  const includeRawDocuments = req.query.includeRawDocuments !== 'false'; // default true

  // Step 1: Read documents — 默认取所有元数据抽取完成的文档，可选按 batchId 过滤
  let docs: any[];
  if (batchId) {
    docs = db.prepare(`SELECT * FROM documents WHERE batch_id = ? AND status != 'deleted'`).all(batchId) as any[];
  } else {
    // 取所有元数据抽取完成、未删除的文档
    docs = db.prepare(`SELECT * FROM documents WHERE meta_status = 'completed' AND status != 'deleted'`).all() as any[];
  }

  const targetDocs = docs.filter(doc => includeArchived ? true : doc.status !== 'archived');
  
  const archivedCount = docs.filter(d => d.status === 'archived').length;
  const pendingCount = docs.filter(d => d.status !== 'archived').length;

  // Step 2: Extract identifiers & weak info
  const docInfos = targetDocs.map(doc => {
    let metadata: any = { result: {} };
    try { 
      if (typeof doc.metadata === 'string') {
        metadata = JSON.parse(doc.metadata || '{}'); 
      } else {
        metadata = doc.metadata || { result: {} };
      }
    } catch(e){}
    const result = metadata.result || {};
    
    // Extracted fields
    const identifiers = (result['唯一标识符'] || []) as Array<{ "标识符类型"?: string, "标识符编号"?: string }>;
    const identifierSet = new Set<string>();
    for (const idObj of identifiers) {
      if (idObj["标识符编号"]) {
        identifierSet.add(String(idObj["标识符编号"]));
      }
    }
    
    return {
      doc,
      docId: doc.id,
      identifierSet,
      name: result['患者姓名'] || '',
      gender: result['患者性别'] || '',
      age: result['患者年龄'] || '',
      birthDate: result['出生日期'] || '',
      hospital: result['机构名称'] || '',
      department: result['科室信息'] || ''
    };
  });

  // Step 3: Group documents
  // Disjoint Set Union
  const parent = new Map<string, string>();
  const find = (i: string) => {
    if (!parent.has(i)) parent.set(i, i);
    if (parent.get(i) !== i) parent.set(i, find(parent.get(i)!));
    return parent.get(i)!;
  };
  const union = (i: string, j: string) => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parent.set(rootI, rootJ);
  };
  
  // Initialize DSU
  for (const info of docInfos) {
    if (!parent.has(info.docId)) parent.set(info.docId, info.docId);
  }

  // Pairwise compare
  for (let i = 0; i < docInfos.length; i++) {
    for (let j = i + 1; j < docInfos.length; j++) {
      const a = docInfos[i];
      const b = docInfos[j];
      
      // Rule 1: identifier match
      let hasIdMatch = false;
      for (const id of a.identifierSet) {
        if (b.identifierSet.has(id)) {
          hasIdMatch = true; 
          break;
        }
      }
      
      if (hasIdMatch) {
         union(a.docId, b.docId);
      } else {
         // Rule 2: weak match
         let score = 0;
         if (a.name && b.name && a.name === b.name) score += 3;
         if (a.birthDate && b.birthDate && a.birthDate === b.birthDate) score += 3;
         if (a.age && b.age && String(a.age) === String(b.age)) score += 2;
         if (a.gender && b.gender && a.gender === b.gender) score += 1;
         if (a.hospital && b.hospital && a.hospital === b.hospital) score += 1;
         if (a.department && b.department && a.department === b.department) score += 1;
         
         if (score >= 5) {
            union(a.docId, b.docId);
         }
      }
    }
  }

  // Grouping
  const groupsMap = new Map<string, typeof docInfos>();
  for (const info of docInfos) {
    const root = find(info.docId);
    if (!groupsMap.has(root)) groupsMap.set(root, []);
    groupsMap.get(root)!.push(info);
  }

  // Step 4: Iterate groups and match with patients
  const allPatients = db.prepare(`SELECT * FROM patients`).all() as any[];
  const parsedPatients = allPatients.map(p => {
    let metadata: any = {};
    try { 
      if (typeof p.metadata === 'string') {
        metadata = JSON.parse(p.metadata || '{}'); 
      } else {
        metadata = p.metadata || {};
      }
    } catch(e){}
    const identifiers = (metadata.identifiers || []).map((id: any) => String(id.value));
    return {
      id: p.id,
      name: p.name || '',
      identifiers: new Set(identifiers),
      gender: metadata.gender || '',
      age: metadata.age || '',
      birthDate: metadata.birthDate || ''
    };
  });

  const responseGroups = [];
  
  for (const [rootId, groupDocs] of Array.from(groupsMap.entries())) {
    const groupId = `group_${rootId.substring(0,8)}`;
    
    // aggregate info
    const groupIdentifierSet = new Set<string>();
    let groupName = '';
    let groupGender = '';
    let groupAge = '';
    let groupBirthDate = '';
    let groupHospital = '';
    let groupDepartment = '';
    
    for (const d of groupDocs) {
      for (const id of d.identifierSet) groupIdentifierSet.add(id);
      if (!groupName && d.name) groupName = d.name;
      if (!groupGender && d.gender) groupGender = d.gender;
      if (!groupAge && d.age) groupAge = d.age;
      if (!groupBirthDate && d.birthDate) groupBirthDate = d.birthDate;
      if (!groupHospital && d.hospital) groupHospital = d.hospital;
      if (!groupDepartment && d.department) groupDepartment = d.department;
    }
    
    const identifiersList = Array.from(groupIdentifierSet);
    
    // Calculate Group Reason
    let groupReason = '单文档无需并组';
    if (groupDocs.length > 1) {
      let hasStrong = false;
      let matchedIds = new Set<string>();
      let weakReasons = new Set<string>();
      
      for (let i = 0; i < groupDocs.length; i++) {
        for (let j = i + 1; j < groupDocs.length; j++) {
           const a = groupDocs[i];
           const b = groupDocs[j];
           let idMatch = false;
           for (const id of a.identifierSet) {
             if (b.identifierSet.has(id)) {
               idMatch = true; matchedIds.add(id);
             }
           }
           if (idMatch) { 
             hasStrong = true; 
           } else {
             if (a.name && b.name && a.name === b.name) weakReasons.add('姓名');
             if (a.birthDate && b.birthDate && a.birthDate === b.birthDate) weakReasons.add('出生日期');
             if (a.age && b.age && String(a.age) === String(b.age)) weakReasons.add('年龄');
           }
        }
      }
      
      if (hasStrong) {
        groupReason = `文档之间唯一标识符重合：${Array.from(matchedIds).join('、')}`;
      } else if (weakReasons.size > 0) {
        groupReason = `文档之间弱信息匹配：${Array.from(weakReasons).join('、')}相同`;
      } else {
        groupReason = `文档之间弱信息匹配`;
      }
    }
    
    // Step 5: MATCH PATIENTS
    const candidates = [];
    let status = 'insufficient_info';
    let confidence = 'low';
    let matchReason = '';

    for (const p of parsedPatients) {
      // rule: high priority match
      let highMatch = false;
      let matchedId = '';
      for (const id of identifiersList) {
        if (p.identifiers.has(id)) {
          highMatch = true; 
          matchedId = id; 
          break;
        }
      }
      
      if (highMatch) {
        candidates.push({
          patientId: p.id,
          name: p.name,
          score: 95,
          reason: `与已有患者唯一标识符重合：${matchedId}`
        });
      } else {
        // secondary priority: weak match
        let score = 0;
        let reasons = [];
        if (groupName && p.name && groupName === p.name) { score += 50; reasons.push('姓名'); }
        if (groupBirthDate && p.birthDate && groupBirthDate === p.birthDate) { score += 20; reasons.push('出生日期'); }
        if (groupGender && p.gender && groupGender === p.gender) { score += 10; reasons.push('性别'); }
        if (groupAge && p.age && String(groupAge) === String(p.age)) { score += 10; reasons.push('年龄'); }
        
        if (score >= 50) {
           candidates.push({
             patientId: p.id,
             name: p.name,
             score,
             reason: `弱信息匹配到已有患者：${reasons.join('、')}相同`
           });
        }
      }
    }
    
    // sort candidates by score
    candidates.sort((a, b) => b.score - a.score);
    
    if (candidates.length > 0 && candidates[0].score >= 90) {
      status = 'matched_existing';
      confidence = 'high';
      matchReason = candidates[0].reason;
    } else if (candidates.length > 0) {
      status = 'needs_confirmation';
      confidence = 'medium';
      matchReason = candidates.length > 1 ? '匹配到多个候选患者，需人工选择' : (candidates[0].reason + '，需人工确认');
    } else { // no matched
      if (groupName || identifiersList.length > 0) {
        status = 'new_patient_candidate';
        confidence = 'medium';
        matchReason = '未匹配到现有患者，建议新建档';
      } else {
        status = 'insufficient_info';
        confidence = 'low';
        matchReason = '信息严重不足，无法匹配或建档';
      }
    }
    
    // Enrich patient snapshot with top candidate if needed
    let snapshotName = groupName;
    let snapshotGender = groupGender;
    let snapshotAge = groupAge;
    let snapshotBirthDate = groupBirthDate;
    
    if (candidates.length > 0) {
      const topPatient = parsedPatients.find(p => p.id === candidates[0].patientId);
      if (topPatient) {
        if (!snapshotName) snapshotName = topPatient.name;
        if (!snapshotGender) snapshotGender = topPatient.gender;
        if (!snapshotAge) snapshotAge = topPatient.age;
        if (!snapshotBirthDate) snapshotBirthDate = topPatient.birthDate;
      }
    }

    // Display name generation rules
    let displayName = '未识别患者组';
    if (status === 'matched_existing' && candidates.length === 1) {
      displayName = candidates[0].name;
    } else if (status === 'needs_confirmation') {
      if (groupName) displayName = `疑似：${groupName}`;
      else if (candidates.length > 0) displayName = `待确认患者组（${candidates[0].name}）`;
      else displayName = '待确认患者组';
    } else {
      if (groupName) displayName = groupName;
      else if (identifiersList.length > 0) displayName = `未知患者（${identifiersList[0]}）`;
    }
    
    // Construct response group
    responseGroups.push({
      groupId,
      displayName,
      status,
      confidence,
      groupReason,
      matchReason,
      identifiers: identifiersList,
      patientSnapshot: {
        name: snapshotName || null,
        gender: snapshotGender || null,
        age: snapshotAge || null,
        birthDate: snapshotBirthDate || null,
        hospital: groupHospital || null,
        department: groupDepartment || null
      },
      documents: includeRawDocuments ? groupDocs.map(d => {
         return {
            id: d.doc.id,
            fileName: d.doc.file_name,
            docType: d.doc.doc_type,
            docSubType: null, 
            docTitle: d.doc.doc_title,
            effectiveAt: d.doc.effective_at,
            status: d.doc.status,
            patientId: d.doc.patient_id
         };
      }) : [],
      candidatePatients: candidates
    });
  }
  
  res.json({
     summary: {
       batchId: batchId ?? null,
       totalDocuments: docs.length,
       groupCount: responseGroups.length,
       archivedCount,
       pendingCount
     },
     groups: responseGroups
  });
});

export default router;
