import React, { useState, useEffect } from 'react';
import {
    Folder, FolderOpen, FileText, Plus, Edit2, Trash2,
    Save, X, BookOpen, AlertCircle, ChevronRight,
    Layers, Database, Hash
} from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog';

const API_BASE = '/api/admin/knowledge';

export default function KnowledgeManager() {
    const [scenes, setScenes] = useState([]);
    const [categories, setCategories] = useState([]);
    const [items, setItems] = useState([]);
    const [riskDict, setRiskDict] = useState([]);

    const [selectedScene, setSelectedScene] = useState(null);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [managerTab, setManagerTab] = useState('knowledge'); // 'knowledge' | 'risk'

    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState('');
    const flash = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    };

    // Generic edit states
    const [editingType, setEditingType] = useState(null); // 'scene' | 'category'
    const [editingId, setEditingId] = useState(null);
    const [editValue, setEditValue] = useState('');

    // Modals visibility
    const [showSceneModal, setShowSceneModal] = useState(false);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [showItemModal, setShowItemModal] = useState(false);

    // Form states
    const [sceneName, setSceneName] = useState('');
    const [categoryName, setCategoryName] = useState('');
    const [itemForm, setItemForm] = useState({
        id: null,
        title: '',
        content: '',
        score_weight: 1,
        likelihood_level: '',
        consequence_level: '',
        standard_code: '',
        tags: []
    });

    useEffect(() => {
        fetchScenes();
        fetchRiskDict();
    }, []);

    const fetchRiskDict = async () => {
        try {
            const res = await fetch('/api/admin/risk/dict');
            if (res.ok) {
                const data = await res.json();
                setRiskDict(data);
            }
        } catch (e) { console.error('加载字典失败', e); }
    };

    const fetchScenes = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/scenes`);
            if (res.ok) {
                const data = await res.json();
                setScenes(data);
            }
        } catch (e) {
            console.error('加载场景失败', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchCategories = async (sceneId) => {
        try {
            const res = await fetch(`${API_BASE}/categories?scene_id=${sceneId}`);
            if (res.ok) {
                const data = await res.json();
                setCategories(data);
            }
        } catch (e) {
            console.error('加载分类失败', e);
        }
    };

    const fetchItems = async (categoryId) => {
        try {
            const res = await fetch(`${API_BASE}/items?category_id=${categoryId}`);
            if (res.ok) {
                const data = await res.json();
                setItems(data);
            }
        } catch (e) {
            console.error('加载条目失败', e);
        }
    };

    const handleCreateScene = async (e) => {
        e.preventDefault();
        if (!sceneName.trim()) return;
        try {
            const res = await fetch(`${API_BASE}/scenes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: sceneName })
            });
            if (res.ok) {
                setSceneName('');
                setShowSceneModal(false);
                fetchScenes();
            }
        } catch (e) { flash('创建失败'); }
    };

    const handleCreateCategory = async (e) => {
        e.preventDefault();
        if (!selectedScene || !categoryName.trim()) return;
        try {
            const res = await fetch(`${API_BASE}/categories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scene_id: selectedScene.id, name: categoryName })
            });
            if (res.ok) {
                setCategoryName('');
                setShowCategoryModal(false);
                fetchCategories(selectedScene.id);
            }
        } catch (e) { flash('创建失败'); }
    };

    const handleSaveItem = async (e) => {
        e.preventDefault();
        try {
            const url = itemForm.id ? `${API_BASE}/items/${itemForm.id}` : `${API_BASE}/items`;
            const method = itemForm.id ? 'PUT' : 'POST';
            const body = itemForm.id ? itemForm : { ...itemForm, category_id: selectedCategory.id };

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                setShowItemModal(false);
                fetchItems(selectedCategory.id);
            }
        } catch (e) { flash('保存失败'); }
    };

    const [confirmDel, setConfirmDel] = useState(null);

    const handleDelete = async (type, id) => {
        setConfirmDel({ type, id });
        return;
    };

    const doDelete = async (type, id) => {
        setConfirmDel(null);
        try {
            const res = await fetch(`${API_BASE}/${type}s/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (type === 'scene') {
                    fetchScenes();
                    if (selectedScene?.id === id) setSelectedScene(null);
                } else if (type === 'category') {
                    fetchCategories(selectedScene.id);
                    if (selectedCategory?.id === id) setSelectedCategory(null);
                } else {
                    fetchItems(selectedCategory.id);
                }
            }
        } catch (e) { flash('删除失败'); }
    };

    const startEditing = (type, obj) => {
        setEditingType(type);
        setEditingId(obj.id);
        setEditValue(obj.name);
    };

    const saveEdit = async () => {
        try {
            const res = await fetch(`${API_BASE}/${editingType}s/${editingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editValue })
            });
            if (res.ok) {
                setEditingId(null);
                if (editingType === 'scene') fetchScenes();
                else fetchCategories(selectedScene.id);
            }
        } catch (e) { flash('更新失败'); }
    };

    const updateRiskDictItem = async (id, level_name, level_value) => {
        try {
            const res = await fetch(`/api/admin/risk/dict/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ level_name, level_value })
            });
            if (res.ok) fetchRiskDict();
        } catch (e) { flash('更新字典失败'); }
    };

    const calculateWeight = (lId, cId) => {
        const lValue = riskDict.find(d => d.id === lId)?.level_value || 0;
        const cValue = riskDict.find(d => d.id === cId)?.level_value || 0;
        return lValue * cValue;
    };

    const getLevelColor = (val) => {
        if (val <= 1) return 'bg-blue-50 border-blue-100 text-blue-700';
        if (val <= 2) return 'bg-emerald-50 border-emerald-100 text-emerald-700';
        if (val <= 3) return 'bg-amber-50 border-amber-100 text-amber-700';
        if (val <= 4) return 'bg-orange-50 border-orange-100 text-orange-700';
        return 'bg-red-50 border-red-100 text-red-700';
    };

    return (
        <div className="h-full flex flex-col bg-white">
            {toast && (
                <div className="mx-6 mt-3 px-4 py-2 rounded-lg bg-amber-50 text-amber-800 text-sm font-bold border border-amber-100">{toast}</div>
            )}
            {/* 头部标题区 */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-indigo-50/30">
                <div className="flex items-center space-x-3">
                    <BookOpen className="w-6 h-6 text-indigo-600" />
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">知识库管理中心</h2>
                </div>
                <div className="flex bg-white/50 p-1 rounded-xl border border-indigo-100">
                    <button
                        onClick={() => setManagerTab('knowledge')}
                        className={`px-4 py-1.5 text-xs font-black rounded-lg transition ${managerTab === 'knowledge' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-indigo-600'}`}
                    >
                        知识体系
                    </button>
                    <button
                        onClick={() => setManagerTab('risk')}
                        className={`px-4 py-1.5 text-xs font-black rounded-lg transition ${managerTab === 'risk' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-indigo-600'}`}
                    >
                        风险字典
                    </button>
                </div>
            </div>

            {managerTab === 'risk' ? (
                <div className="flex-1 overflow-y-auto p-8 bg-gray-50/20">
                    <div className="max-w-4xl mx-auto space-y-8">
                        <div>
                            <h3 className="text-sm font-black text-gray-900 mb-4 flex items-center">
                                <Database className="w-4 h-4 mr-2 text-indigo-500" /> 风险发生概率 (Likelihood)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                {riskDict.filter(d => d.type === 'likelihood').sort((a, b) => a.level_value - b.level_value).map(item => (
                                    <div key={item.id} className={`${getLevelColor(item.level_value)} p-4 rounded-2xl border shadow-sm space-y-3 transition-colors`}>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-mono opacity-60">等级权重</span>
                                            <input
                                                type="number"
                                                className="w-12 bg-white/50 border-none rounded p-0.5 text-xs font-bold text-center focus:ring-1 focus:ring-indigo-500"
                                                value={item.level_value}
                                                onChange={(e) => updateRiskDictItem(item.id, item.level_name, parseInt(e.target.value) || 0)}
                                            />
                                        </div>
                                        <input
                                            className="w-full text-sm font-black border-none bg-transparent focus:ring-0 p-0"
                                            value={item.level_name}
                                            onChange={(e) => updateRiskDictItem(item.id, e.target.value, item.level_value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-black text-gray-900 mb-4 flex items-center">
                                <AlertCircle className="w-4 h-4 mr-2 text-red-500" /> 后果严重性 (Consequence)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                {riskDict.filter(d => d.type === 'consequence').sort((a, b) => a.level_value - b.level_value).map(item => (
                                    <div key={item.id} className={`${getLevelColor(item.level_value)} p-4 rounded-2xl border shadow-sm space-y-3 transition-colors`}>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-mono opacity-60">等级权重</span>
                                            <input
                                                type="number"
                                                className="w-12 bg-white/50 border-none rounded p-0.5 text-xs font-bold text-center focus:ring-1 focus:ring-indigo-500"
                                                value={item.level_value}
                                                onChange={(e) => updateRiskDictItem(item.id, item.level_name, parseInt(e.target.value) || 0)}
                                            />
                                        </div>
                                        <input
                                            className="w-full text-sm font-black border-none bg-transparent focus:ring-0 p-0"
                                            value={item.level_name}
                                            onChange={(e) => updateRiskDictItem(item.id, e.target.value, item.level_value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start space-x-3">
                            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div className="text-xs text-amber-800 leading-relaxed">
                                <strong className="block mb-1">评分权重说明：</strong>
                                最终权重由“概率等级 × 后果等级”自动计算得出（范围 1-25）。修改以上等级名称将即时同步至所有知识条目的定义界面。
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-hidden flex divide-x divide-gray-100">

                    {/* 第一列：业务场景 */}
                    <div className="w-1/4 flex flex-col">
                        <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center">
                                <Database className="w-3 h-3 mr-1.5" /> 业务场景 (L1)
                            </span>
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowSceneModal(true); }}
                                className="p-1 hover:bg-gray-200 text-gray-500 rounded transition"
                                title="添加场景"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                            {scenes.map(s => (
                                <div
                                    key={s.id}
                                    onClick={() => { setSelectedScene(s); fetchCategories(s.id); }}
                                    className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all duration-200 ${selectedScene?.id === s.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-[1.02]' : 'hover:bg-gray-100'}`}
                                >
                                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                                        {selectedScene?.id === s.id ? <FolderOpen className="w-4 h-4 flex-shrink-0" /> : <Folder className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                                        {editingId === s.id && editingType === 'scene' ? (
                                            <input
                                                autoFocus
                                                className="bg-white/20 text-white border-0 focus:ring-0 p-0 text-sm font-bold w-full rounded"
                                                value={editValue}
                                                onChange={e => setEditValue(e.target.value)}
                                                onBlur={saveEdit}
                                                onKeyDown={e => e.key === 'Enter' && saveEdit()}
                                            />
                                        ) : (
                                            <span className="text-sm font-bold truncate">{s.name}</span>
                                        )}
                                    </div>
                                    {selectedScene?.id === s.id && editingId !== s.id && (
                                        <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={(e) => { e.stopPropagation(); startEditing('scene', s); }} className="p-1 hover:bg-indigo-500 rounded text-indigo-100"><Edit2 className="w-3 h-3" /></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDelete('scene', s.id); }} className="p-1 hover:bg-indigo-500 rounded text-indigo-100"><Trash2 className="w-3 h-3" /></button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 第二列：隐患大类 */}
                    <div className="w-1/4 flex flex-col bg-gray-50/20">
                        <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center">
                                <Layers className="w-3 h-3 mr-1.5" /> 隐患大类 (L2)
                            </span>
                            {selectedScene && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowCategoryModal(true); }}
                                    className="p-1 hover:bg-gray-200 text-gray-500 rounded transition"
                                    title="添加分类"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                            {!selectedScene ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-300 p-8 text-center">
                                    <AlertCircle className="w-8 h-8 mb-2 opacity-20" />
                                    <p className="text-xs font-medium">请先选择一个场景</p>
                                </div>
                            ) : (
                                categories.map(c => (
                                    <div
                                        key={c.id}
                                        onClick={() => { setSelectedCategory(c); fetchItems(c.id); }}
                                        className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all duration-200 ${selectedCategory?.id === c.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'hover:bg-gray-100'}`}
                                    >
                                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                                            <Layers className={`w-4 h-4 flex-shrink-0 ${selectedCategory?.id === c.id ? '' : 'text-gray-400'}`} />
                                            {editingId === c.id && editingType === 'category' ? (
                                                <input
                                                    autoFocus
                                                    className="bg-white/20 text-white border-0 focus:ring-0 p-0 text-sm font-bold w-full rounded"
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    onBlur={saveEdit}
                                                    onKeyDown={e => e.key === 'Enter' && saveEdit()}
                                                />
                                            ) : (
                                                <span className="text-sm font-medium truncate">{c.name}</span>
                                            )}
                                        </div>
                                        {selectedCategory?.id === c.id && editingId !== c.id && (
                                            <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={(e) => { e.stopPropagation(); startEditing('category', c); }} className="p-1 hover:bg-indigo-500 rounded text-indigo-100"><Edit2 className="w-3 h-3" /></button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDelete('category', c.id); }} className="p-1 hover:bg-indigo-500 rounded text-indigo-100"><Trash2 className="w-3 h-3" /></button>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* 第三列：条款明细 */}
                    <div className="flex-1 flex flex-col">
                        <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center">
                                <FileText className="w-3 h-3 mr-1.5" /> 隐患指纹细则 (L3)
                            </span>
                            {selectedCategory && (
                                <button
                                    onClick={() => {
                                        setItemForm({
                                            id: null,
                                            title: '',
                                            content: '',
                                            score_weight: 1,
                                            likelihood_level: 'lh_1',
                                            consequence_level: 'cq_1',
                                            standard_code: '',
                                            tags: []
                                        });
                                        setShowItemModal(true);
                                    }}
                                    className="flex items-center px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition shadow-sm"
                                >
                                    <Plus className="w-3 h-3 mr-1" /> 新增条款
                                </button>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/10 custom-scrollbar">
                            {!selectedCategory ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-300 p-8 text-center italic">
                                    <p className="text-sm">选择大类后管理具体隐患条目</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4 max-w-4xl mx-auto">
                                    {items.length === 0 && <p className="text-center py-20 text-gray-400 text-sm">暂无数据，请点击右上角新增</p>}
                                    {items.map(item => (
                                        <div key={item.id} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group relative border-l-4 border-l-indigo-500">
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="space-y-1">
                                                    <div className="flex items-center">
                                                        <span className="text-[10px] font-mono text-gray-400 mr-2">ID: {item.id}</span>
                                                        <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-tighter">WT: {item.score_weight}</span>
                                                    </div>
                                                    <h4 className="font-black text-gray-900 leading-tight">{item.title}</h4>
                                                </div>
                                                <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => { setItemForm(item); setShowItemModal(true); }}
                                                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-indigo-600 transition"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete('item', item.id)}
                                                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-600 transition"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100">{item.content || <em className="text-gray-400">未填写法规条文原文</em>}</p>
                                            <div className="mt-3 flex items-center justify-between">
                                                {item.standard_code && (
                                                    <div className="flex items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                        <Hash className="w-3 h-3 mr-1" /> 标准代码: <span className="text-gray-600 ml-1">{item.standard_code}</span>
                                                    </div>
                                                )}
                                                <div className="flex items-center space-x-2">
                                                    <span className="text-[10px] text-gray-400 font-medium">风险配置:</span>
                                                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                                                        {riskDict.find(d => d.id === item.likelihood_level)?.level_name || '未评级'} × {riskDict.find(d => d.id === item.consequence_level)?.level_name || '未评级'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 新增/编辑条目 Modal */}
            {showItemModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in duration-300">
                        <div className="bg-indigo-600 p-6 text-white flex justify-between items-center">
                            <h3 className="text-xl font-black tracking-tight">{itemForm.id ? '编辑指纹条款' : '新增隐患条款'}</h3>
                            <button onClick={() => setShowItemModal(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSaveItem} className="p-8 space-y-5">
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">隐患定性 (Title)</label>
                                <input
                                    required
                                    autoFocus
                                    className="w-full bg-gray-50 border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition"
                                    placeholder="例如：高空作业人员未正确佩戴安全防护装备"
                                    value={itemForm.title}
                                    onChange={e => setItemForm({ ...itemForm, title: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">发生概率 (Likelihood)</label>
                                    <select
                                        className="w-full bg-gray-50 border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition"
                                        value={itemForm.likelihood_level}
                                        onChange={e => {
                                            const weight = calculateWeight(e.target.value, itemForm.consequence_level);
                                            setItemForm({ ...itemForm, likelihood_level: e.target.value, score_weight: weight });
                                        }}
                                    >
                                        {riskDict.filter(d => d.type === 'likelihood').map(d => (
                                            <option key={d.id} value={d.id}>{d.level_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">后果严重性 (Consequence)</label>
                                    <select
                                        className="w-full bg-gray-50 border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition"
                                        value={itemForm.consequence_level}
                                        onChange={e => {
                                            const weight = calculateWeight(itemForm.likelihood_level, e.target.value);
                                            setItemForm({ ...itemForm, consequence_level: e.target.value, score_weight: weight });
                                        }}
                                    >
                                        {riskDict.filter(d => d.type === 'consequence').map(d => (
                                            <option key={d.id} value={d.id}>{d.level_name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">实时计算分值 (Weight)</label>
                                    <div className="w-full bg-indigo-600 border border-indigo-700 text-white rounded-xl px-4 py-3 text-sm font-black shadow-lg shadow-indigo-100">
                                        {calculateWeight(itemForm.likelihood_level, itemForm.consequence_level)} 分
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">标准代码 (Optional)</label>
                                    <input
                                        className="w-full bg-gray-50 border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 transition"
                                        placeholder="如 GB30871"
                                        value={itemForm.standard_code}
                                        onChange={e => setItemForm({ ...itemForm, standard_code: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">法规条文原文 (Content)</label>
                                <textarea
                                    className="w-full bg-gray-50 border-gray-200 rounded-xl px-4 py-3 text-sm h-32 leading-relaxed focus:ring-2 focus:ring-indigo-500 transition resize-none"
                                    placeholder="请在此输入对应的行业标准或法律规定原文..."
                                    value={itemForm.content}
                                    onChange={e => setItemForm({ ...itemForm, content: e.target.value })}
                                ></textarea>
                            </div>
                            <div className="flex justify-end space-x-3 pt-4">
                                <button type="button" onClick={() => setShowItemModal(false)} className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-xl transition">取消</button>
                                <button type="submit" className="px-8 py-2.5 bg-indigo-600 text-white text-sm font-black rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition">保存条目</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* 新增场景 Modal */}
            {showSceneModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300">
                        <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
                            <h3 className="text-lg font-black tracking-tight">新增业务场景</h3>
                            <button onClick={() => setShowSceneModal(false)} className="bg-white/10 hover:bg-white/20 p-1 rounded-full transition"><X className="w-4 h-4" /></button>
                        </div>
                        <form onSubmit={handleCreateScene} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">场景名称</label>
                                <input
                                    required
                                    autoFocus
                                    className="w-full bg-gray-50 border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition"
                                    placeholder="如：化工厂区"
                                    value={sceneName}
                                    onChange={e => setSceneName(e.target.value)}
                                />
                            </div>
                            <div className="flex justify-end space-x-3 pt-2">
                                <button type="button" onClick={() => setShowSceneModal(false)} className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-50 rounded-lg transition">取消</button>
                                <button type="submit" className="px-6 py-2 bg-indigo-600 text-white text-xs font-black rounded-lg shadow-lg hover:bg-indigo-700 transition">确定新增</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 新增分类 Modal */}
            {showCategoryModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300">
                        <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
                            <h3 className="text-lg font-black tracking-tight">新增隐患大类</h3>
                            <button onClick={() => setShowCategoryModal(false)} className="bg-white/10 hover:bg-white/20 p-1 rounded-full transition"><X className="w-4 h-4" /></button>
                        </div>
                        <form onSubmit={handleCreateCategory} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">分类名称</label>
                                <input
                                    required
                                    autoFocus
                                    className="w-full bg-gray-50 border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition"
                                    placeholder="如：火灾隐患"
                                    value={categoryName}
                                    onChange={e => setCategoryName(e.target.value)}
                                />
                            </div>
                            <div className="flex justify-end space-x-3 pt-2">
                                <button type="button" onClick={() => setShowCategoryModal(false)} className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-50 rounded-lg transition">取消</button>
                                <button type="submit" className="px-6 py-2 bg-indigo-600 text-white text-xs font-black rounded-lg shadow-lg hover:bg-indigo-700 transition">确定新增</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <ConfirmDialog
                open={!!confirmDel}
                title="删除知识条目"
                message="确定要删除此项吗？此操作不可撤销且将删除其下属关联内容。"
                danger
                onCancel={() => setConfirmDel(null)}
                onConfirm={() => confirmDel && doDelete(confirmDel.type, confirmDel.id)}
            />
        </div>
    );
}
