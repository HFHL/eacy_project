import React, { useState, useMemo } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  UserPlus, 
  FileQuestion, 
  Search, 
  Filter, 
  FileText, 
  User, 
  Calendar, 
  FileCode2, 
  ChevronRight,
  Zap,
  Check,
  X,
  AlertTriangle
} from 'lucide-react';
import DocumentDetailModal from './PatientDetail/tabs/DocumentsTab/components/DocumentDetailModal';

// --- Mock Data ---
const MOCK_BATCH_INFO = {
  id: 'BATCH-20260410-001',
  name: '2026-04-10 上午门诊扫描批次',
  uploadTime: '2026-04-10 09:30:00',
  totalDocs: 18,
  operator: '王护士'
};

const INITIAL_GROUPS = [];

const STATUS_CONFIG = {
  ready: { label: '可直接归档', icon: CheckCircle2, color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
  confirm: { label: '需确认患者', icon: AlertCircle, color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
  new: { label: '建议新建', icon: UserPlus, color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  failed: { label: '信息不足', icon: FileQuestion, color: 'text-gray-700', bgColor: 'bg-gray-100', borderColor: 'border-gray-300' },
};

// --- Main Component ---
export default function BatchArchiveWorkspace() {
  const [groups, setGroups] = useState(INITIAL_GROUPS);
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);

  // Computed values
  const filteredGroups = useMemo(() => {
    if (activeFilter === 'all') return groups;
    return groups.filter(g => g.status === activeFilter);
  }, [groups, activeFilter]);

  const stats = useMemo(() => {
    const s = { all: groups.length, ready: 0, confirm: 0, new: 0, failed: 0 };
    groups.forEach(g => { if (s[g.status] !== undefined) s[g.status]++; });
    return s;
  }, [groups]);

  const selectedGroup = useMemo(() => groups.find(g => g.id === selectedGroupId), [groups, selectedGroupId]);

  // Actions
  const handleProcessGroup = async (id, overridePatientId = null) => {
    const group = groups.find(g => g.id === id);
    if (!group) return;

    try {
      const documentIds = group.docs.map(d => d.id);
      
      if (group.status === 'ready' || group.status === 'confirm') {
        const targetPatientId = overridePatientId || group.targetPatient?.id;
        if (!targetPatientId) {
           alert('未选择目标患者'); return;
        }
        await fetch('http://localhost:8000/api/v1/documents/archive-to-patient', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentIds, patientId: targetPatientId, batchId: 'batch_001' })
        });
      } else if (group.status === 'new') {
        await fetch('http://localhost:8000/api/v1/documents/create-patient-and-archive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentIds, batchId: 'batch_001' })
        });
      }

      // 成功后，从列表中移除
      const newGroups = groups.filter(g => g.id !== id);
      setGroups(newGroups);
      if (selectedGroupId === id) {
        setSelectedGroupId(newGroups.length > 0 ? newGroups[0].id : null);
      }
    } catch (err) {
      console.error(err);
      alert('处理失败');
    }
  };

  const handleProcessAllReady = async () => {
    const readyGroups = groups.filter(g => g.status === 'ready');
    for (const group of readyGroups) {
      if (!group.targetPatient?.id) continue;
      const documentIds = group.docs.map(d => d.id);
      try {
        await fetch('http://localhost:8000/api/v1/documents/archive-to-patient', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentIds, patientId: group.targetPatient.id, batchId: 'batch_001' })
        });
      } catch(e) {
        console.error(e);
      }
    }
    const newGroups = groups.filter(g => g.status !== 'ready');
    setGroups(newGroups);
    if (selectedGroup?.status === 'ready') {
       setSelectedGroupId(newGroups.length > 0 ? newGroups[0].id : null);
    }
  };

  const handleFetchGroups = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/archive-batches/groups');
      const data = await res.json();
      const apiGroups = data.groups || [];

      const mappedGroups = apiGroups.map(g => {
        let localStatus = 'failed';
        if (g.status === 'matched_existing') localStatus = 'ready';
        else if (g.status === 'needs_confirmation') localStatus = 'confirm';
        else if (g.status === 'new_patient_candidate') localStatus = 'new';
        
        let confNum = 0;
        if (g.confidence === 'high') confNum = 95;
        else if (g.confidence === 'medium') confNum = 60;
        else confNum = 20;

        return {
          id: g.groupId,
          status: localStatus,
          patientName: g.displayName, 
          gender: g.patientSnapshot?.gender || '未知',
          age: g.patientSnapshot?.age || '',
          mrn: g.identifiers?.[0] || null,
          idCard: null,
          docCount: g.documents.length,
          docSummary: `${g.documents.length} 份文档`,
          confidence: confNum,
          docs: g.documents.map(d => ({
            id: d.id,
            title: d.fileName,
            type: d.docType || '文档',
            date: d.effectiveAt || '未知',
            extractStatus: d.status?.toLowerCase() === 'metadata_succeeded' ? 'success' : 'failed',
            keyInfo: '系统解析数据'
          })),
          targetPatient: g.candidatePatients?.[0] ? { ...g.candidatePatients[0], id: g.candidatePatients[0].patientId } : {},
          candidates: g.candidatePatients.map(c => ({
             id: c.patientId,
             name: c.name,
             gender: '未知',
             dob: '',
             mrn: '',
             docCount: 0,
             matchReason: c.reason
          })),
          reason: `1. ${g.groupReason}
2. ${g.matchReason}`
        };
      });
      setGroups(mappedGroups);
      if (mappedGroups.length > 0) setSelectedGroupId(mappedGroups[0].id);
    } catch (e) {
      console.error(e);
      alert('获取分组失败，请检查后端是否运行。');
    }
  };

  // --- Sub-components rendering ---
  const renderRightPanel = () => {
    if (!selectedGroup) return <div className="flex-1 flex items-center justify-center text-gray-400 bg-gray-50">请选择左侧患者组进行处理</div>;

    const conf = STATUS_CONFIG[selectedGroup.status];

    return (
      <div className="flex-1 flex flex-col h-full bg-white">
        {/* Panel Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              {selectedGroup.patientName} 的文档组
              <span className={`text-xs px-2 py-0.5 rounded-full border ${conf.bgColor} ${conf.color} ${conf.borderColor}`}>
                {conf.label}
              </span>
            </h2>
            <p className="text-sm text-gray-500 mt-1">包含 {selectedGroup.docCount} 份文档 · 置信度 {selectedGroup.confidence}%</p>
          </div>
          <button 
            onClick={() => handleProcessGroup(selectedGroup.id)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="暂挂 / 跳过"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Documents Detail */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <FileText size={16} className="text-gray-400"/>
              文档明细 ({selectedGroup.docCount})
            </h3>
            <div className="border border-gray-200 rounded-md divide-y divide-gray-100">
              {selectedGroup.docs.map(doc => (
                <div 
                  key={doc.id} 
                  className="p-3 hover:bg-gray-50 transition-colors flex gap-4 cursor-pointer"
                  onClick={() => {
                    setSelectedDocument({
                      id: doc.id,
                      fileName: doc.title,
                      status: doc.extractStatus
                    });
                    setDetailModalVisible(true);
                  }}
                >
                  <div className="bg-gray-100 p-2 rounded h-fit">
                    <FileCode2 size={20} className="text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                      <span className="text-xs text-gray-500">{doc.date}</span>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{doc.type}</span>
                      {doc.extractStatus === 'failed' ? (
                        <span className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12}/> 提取失败</span>
                      ) : (
                        <span className="text-xs text-green-600 flex items-center gap-1"><Check size={12}/> 提取成功</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2 bg-gray-50 p-2 rounded border border-gray-100">
                      <span className="font-medium text-gray-600">提取摘要: </span>
                      {doc.keyInfo}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 2: System Rationale */}
          <section className="bg-blue-50/50 p-4 rounded-md border border-blue-100">
            <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
              <Zap size={16} className="text-blue-500"/>
              系统处理建议
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              {selectedGroup.reason}
            </p>
          </section>

          {/* Section 3: Action Panel (Dynamic) */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <User size={16} className="text-gray-400"/>
              归档操作
            </h3>
            
            {/* Status: Ready */}
            {selectedGroup.status === 'ready' && (
              <div className="bg-white border border-green-200 rounded-md p-4 shadow-sm">
                <p className="text-sm text-gray-500 mb-3">将归档至以下现有患者记录：</p>
                <div className="flex items-center gap-4 p-3 bg-gray-50 rounded border border-gray-200 mb-4">
                  <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold">
                    {(selectedGroup.targetPatient?.name || '未').charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{selectedGroup.targetPatient?.name || '未知患者'}</p>
                    <p className="text-xs text-gray-500">ID: {selectedGroup.targetPatient?.mrn} · 出生: {selectedGroup.targetPatient?.dob}</p>
                  </div>
                </div>
                <button 
                  onClick={() => handleProcessGroup(selectedGroup.id)}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors flex justify-center items-center gap-2"
                >
                  <CheckCircle2 size={18} />确认归档至该患者
                </button>
              </div>
            )}

            {/* Status: Confirm */}
            {selectedGroup.status === 'confirm' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 mb-2">找到 {selectedGroup.candidates.length} 个可能的匹配项，请选择：</p>
                {selectedGroup.candidates.map((candidate, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-md p-4 flex flex-col gap-3 hover:border-blue-300 transition-colors bg-white shadow-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                         <div className="h-8 w-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-bold text-sm">
                          {(candidate.name || '未').charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {candidate.name} <span className="text-xs font-normal text-gray-500 ml-1">({candidate.gender}, {candidate.dob})</span>
                          </p>
                          <p className="text-xs text-gray-500">ID: {candidate.mrn} · 现有文档: {candidate.docCount}份</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleProcessGroup(selectedGroup.id, candidate.id)}
                        className="px-4 py-1.5 bg-white border border-gray-300 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 text-gray-700 text-sm font-medium rounded transition-colors"
                      >
                        归档至此
                      </button>
                    </div>
                    <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                      <span className="font-semibold">匹配提示:</span> {candidate.matchReason}
                    </div>
                  </div>
                ))}
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end gap-3">
                   <button className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded transition-colors">
                    都不是，新建患者
                  </button>
                </div>
              </div>
            )}

            {/* Status: New */}
            {selectedGroup.status === 'new' && (
              <div className="bg-white border border-blue-200 rounded-md p-4 shadow-sm">
                <p className="text-sm text-gray-500 mb-4">系统将使用提取的信息创建新档案：</p>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">姓名</label>
                    <input type="text" readOnly value={selectedGroup.patientName} className="w-full text-sm p-2 bg-gray-50 border border-gray-200 rounded outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">性别</label>
                    <input type="text" readOnly value={selectedGroup.gender} className="w-full text-sm p-2 bg-gray-50 border border-gray-200 rounded outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">身份证号</label>
                    <input type="text" readOnly value={selectedGroup.idCard || ''} className="w-full text-sm p-2 bg-gray-50 border border-gray-200 rounded outline-none" />
                  </div>
                   <div>
                    <label className="block text-xs text-gray-500 mb-1">年龄</label>
                    <input type="text" readOnly value={selectedGroup.age || ''} className="w-full text-sm p-2 bg-gray-50 border border-gray-200 rounded outline-none" />
                  </div>
                </div>
                <div className="flex gap-3">
                   <button className="flex-1 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-md transition-colors">
                    编辑信息
                  </button>
                  <button 
                    onClick={() => handleProcessGroup(selectedGroup.id)}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors flex justify-center items-center gap-2"
                  >
                    <UserPlus size={18} />新建并归档
                  </button>
                </div>
              </div>
            )}

            {/* Status: Failed */}
            {selectedGroup.status === 'failed' && (
              <div className="bg-white border border-gray-200 rounded-md p-4 shadow-sm">
                <p className="text-sm text-gray-600 mb-4">
                  由于信息不足，系统无法给出建议。请手动选择操作：
                </p>
                <div className="flex flex-col gap-3">
                  <button className="w-full py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-md transition-colors flex justify-center items-center gap-2">
                    <Search size={16} />手动搜索患者归档
                  </button>
                   <button 
                    onClick={() => handleProcessGroup(selectedGroup.id)}
                    className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md transition-colors"
                  >
                    暂不处理 (挂起)
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen w-full bg-gray-100 flex flex-col font-sans overflow-hidden">
      
      {/* --- Top Header Bar --- */}
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-gray-800 tracking-tight">批量归档工作台</h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleFetchGroups}
            className="text-sm font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded border border-indigo-200 transition-colors"
          >
            调取真实API获取分组
          </button>
          <div className="text-sm font-medium bg-blue-50 text-blue-800 px-3 py-1.5 rounded border border-blue-100">
            剩余待处理：{stats.all} 组
          </div>
          {stats.ready > 0 && (
             <button 
              onClick={handleProcessAllReady}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors shadow-sm"
            >
              <Zap size={16} /> 一键处理高置信归档 ({stats.ready})
            </button>
          )}
        </div>
      </header>

      {/* --- Main Two-Column Layout --- */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Column: Group List & Filters */}
        <section className="w-[440px] bg-gray-50 border-r border-gray-200 flex flex-col shrink-0 z-10">
          <div className="p-4 border-b border-gray-200 bg-white flex flex-col gap-3 shadow-sm z-10">
            <div className="flex justify-between items-center">
              <span className="text-base font-bold text-gray-800">患者组列表</span>
            </div>
            
            {/* Horizontal Filters */}
            <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {[
                { id: 'all', label: '全部', count: stats.all, icon: FileText, activeClass: 'bg-gray-800 text-white border-gray-800', inactiveClass: 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50' },
                { id: 'ready', label: '可归档', count: stats.ready, icon: CheckCircle2, activeClass: 'bg-green-600 text-white border-green-600', inactiveClass: 'bg-white text-green-700 border-green-200 hover:bg-green-50' },
                { id: 'confirm', label: '需确认', count: stats.confirm, icon: AlertCircle, activeClass: 'bg-amber-500 text-white border-amber-500', inactiveClass: 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50' },
                { id: 'new', label: '建议新建', count: stats.new, icon: UserPlus, activeClass: 'bg-blue-600 text-white border-blue-600', inactiveClass: 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50' },
                { id: 'failed', label: '信息不足', count: stats.failed, icon: FileQuestion, activeClass: 'bg-gray-500 text-white border-gray-500', inactiveClass: 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50' },
              ].map(item => {
                const isActive = activeFilter === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveFilter(item.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition-colors ${isActive ? item.activeClass : item.inactiveClass}`}
                  >
                    <item.icon size={14} />
                    {item.label}
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] leading-none ${isActive ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
                      {item.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {filteredGroups.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                <CheckCircle2 size={32} className="mx-auto mb-2 opacity-50" />
                该分类下任务已清空
              </div>
            ) : (
              filteredGroups.map(group => {
                const conf = STATUS_CONFIG[group.status];
                const isSelected = selectedGroupId === group.id;

                return (
                  <div 
                    key={group.id}
                    onClick={() => setSelectedGroupId(group.id)}
                    className={`p-4 rounded-lg cursor-pointer transition-all border ${
                      isSelected 
                        ? 'bg-white border-blue-400 shadow-md ring-1 ring-blue-400' 
                        : 'bg-white border-gray-200 shadow-sm hover:border-gray-300 hover:shadow'
                    }`}
                  >
                    {/* Card Header: Status Badge & Conf */}
                    <div className="flex justify-between items-start mb-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${conf.bgColor} ${conf.color} border ${conf.borderColor}`}>
                        <conf.icon size={12} /> {conf.label}
                      </span>
                      <span className="text-xs text-gray-400" title="系统推荐置信度">置信度: {group.confidence}%</span>
                    </div>

                    {/* Patient Info */}
                    <div className="mb-3">
                      <h4 className="text-base font-bold text-gray-900">{group.patientName}</h4>
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                        {group.gender !== '未知' && <span>{group.gender} · {group.age}岁</span>}
                        {group.mrn && <span className="bg-gray-100 px-1.5 rounded text-gray-600">{group.mrn}</span>}
                      </p>
                    </div>

                    {/* Docs Info */}
                    <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-3">
                      <div className="text-gray-600 flex items-center gap-1.5">
                        <FileText size={14} className="text-gray-400"/> 
                        <span className="font-medium">{group.docCount}</span> 份文档
                      </div>
                      <span className="text-xs text-gray-400 truncate max-w-[120px]" title={group.docSummary}>
                        {group.docSummary}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Right Column: Dynamic Detail Panel */}
        {renderRightPanel()}

      </div>

      <DocumentDetailModal
        visible={detailModalVisible}
        document={selectedDocument}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedDocument(null);
        }}
        showTaskStatus={true}
      />
    </div>
  );
}
