import React, { useState, useEffect, useRef } from 'react';
import { Layers, FilePlus2, Search, Eye } from 'lucide-react';

export default function TestAssembler() {
    const [images, setImages] = useState([]);
    const [selectedImages, setSelectedImages] = useState([]);
    const [paperName, setPaperName] = useState("本月安全隐患排查测验");
    const [paperDesc, setPaperDesc] = useState("这是一场例行的安全测验，请仔细排查图中的所有隐患点。");

    // Search & Filter
    const [searchQuery, setSearchQuery] = useState('');
    const [filterScene, setFilterScene] = useState('all');
    const [knowledgeTree, setKnowledgeTree] = useState([]);
    const [activePreview, setActivePreview] = useState(null);

    // Scoring Options
    const [totalScore, setTotalScore] = useState(100);
    const [scoringRule, setScoringRule] = useState('weighted'); // 'weighted' | 'average'
    const [timeLimitSec, setTimeLimitSec] = useState(0);
    const [publishing, setPublishing] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    };

    const containerRef = useRef(null);
    const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
    const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

    useEffect(() => {
        if (!containerRef.current) return;
        const obs = new ResizeObserver(entries => {
            for (let entry of entries) {
                setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
            }
        });
        obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, [activePreview]);

    const handleImageLoad = (e) => {
        setImgSize({ w: e.target.naturalWidth, h: e.target.naturalHeight });
    };

    let previewStyle = { maxWidth: '100%', maxHeight: '100%' };
    if (imgSize.w && imgSize.h && containerSize.w && containerSize.h) {
        const availableW = containerSize.w - 16; // compensate for p-2
        const availableH = containerSize.h - 16;
        const imgRatio = imgSize.w / imgSize.h;
        const containerRatio = availableW / availableH;

        if (imgRatio > containerRatio) {
            // 宽图：宽度满格，高度自适应
            previewStyle = { width: '100%', height: 'auto', aspectRatio: `${imgSize.w}/${imgSize.h}` };
        } else {
            // 长图：高度满格，宽度自适应
            previewStyle = { height: '100%', width: 'auto', aspectRatio: `${imgSize.w}/${imgSize.h}` };
        }
    }

    useEffect(() => {
        fetchImages();
        fetchKnowledge();
    }, []);

    const fetchImages = async () => {
        const res = await fetch('/api/assets');
        const data = await res.json();
        const list = data.data || [];
        // 以实际标注条数为准（兼容 is_annotated 脏标记）
        const annotated = list.filter(img =>
            img.isAnnotated || (img.meta?.items && img.meta.items.length > 0)
        );
        setImages(annotated);
        if (list.length > 0 && annotated.length === 0) {
            console.warn('[组卷] 有图库素材但无有效标注。请先在「图库标注」中框选并保存隐患点。');
        }
    };

    const fetchKnowledge = async () => {
        const res = await fetch('/api/knowledge');
        const data = await res.json();
        setKnowledgeTree(data.knowledgeTree || []);
    };

    const toggleSelect = (img) => {
        if (selectedImages.find(s => s.name === img.name)) {
            setSelectedImages(selectedImages.filter(s => s.name !== img.name));
            if (activePreview?.name === img.name) setActivePreview(null);
        } else {
            setSelectedImages([...selectedImages, img]);
            setActivePreview(img);
        }
    };

    const handleSaveOrPublish = async (status) => {
        if (!paperName.trim()) { showToast('请输入考卷名称', 'error'); return; }
        if (selectedImages.length === 0) { showToast('请至少选择一题', 'error'); return; }
        if (publishing) return;

        setPublishing(true);
        try {
            const payload = {
                examName: paperName.trim(),
                description: paperDesc.trim(),
                createdAt: Date.now(),
                slides: selectedImages.map(img => img.name),
                status: status,
                total_score: totalScore,
                scoring_rule: scoringRule,
                time_limit_sec: Number(timeLimitSec) || 0
            };
            const res = await fetch('/api/exams/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const actionText = status === 'published' ? '发布' : '保存';
                showToast(`试卷【${paperName}】${actionText}成功`);
                setSelectedImages([]);
                setActivePreview(null);
            } else {
                showToast('试卷状态更新失败', 'error');
            }
        } catch (err) {
            showToast('网络传输错误', 'error');
        } finally {
            setPublishing(false);
        }
    };

    // Dictionary for deep mapping
    const clauseMap = React.useMemo(() => {
        const map = {};
        knowledgeTree.forEach(sceneNode => {
            sceneNode.types.forEach(typeNode => {
                typeNode.items.forEach(item => {
                    map[item.id] = {
                        scene: sceneNode.scene,
                        type: typeNode.typeName,
                        desc: item.desc,
                        clause: item.clause
                    };
                });
            });
        });
        return map;
    }, [knowledgeTree]);

    const filteredImages = images.filter(img => {
        // 构建全维度检索引擎文本池
        let totalText = `${img.name} ${img.baseName || ''} ${img.originalName || ''}`.toLowerCase();
        if (img.meta?.items?.length > 0) {
            const annoTexts = img.meta.items.map(anno => {
                const data = clauseMap[anno.clauseId];
                return data ? `${data.scene} ${data.type} ${data.desc} ${data.clause}`.toLowerCase() : '';
            });
            totalText += ' ' + annoTexts.join(' ');
        }

        // 支持空格分割的多关键词并集(AND)模糊联查
        const keywords = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
        const matchQuery = keywords.every(kw => totalText.includes(kw));

        let matchScene = true;
        if (filterScene !== 'all' && img.meta?.items?.length > 0) {
            matchScene = img.meta.items.some(anno => clauseMap[anno.clauseId]?.scene === filterScene);
        } else if (filterScene !== 'all') {
            matchScene = false; // Has no annotations with matchable clause
        }
        return matchQuery && matchScene;
    });

    // 计算分值分配 (倒挤法)
    const examScores = React.useMemo(() => {
        if (selectedImages.length === 0) return [];
        let scores = [];
        const totalExamPoints = selectedImages.reduce((sum, img) => sum + (img.meta?.items?.length || 0), 0);
        const totalExamWeight = selectedImages.reduce((sum, img) => {
            const caseWeight = (img.meta?.items || []).reduce((s, it) => s + (it.scoreWeight || 0), 0);
            return sum + caseWeight;
        }, 0);

        if (scoringRule === 'average' && totalExamPoints > 0) {
            const base = Math.floor(totalScore / totalExamPoints);
            let remainder = totalScore % totalExamPoints;

            selectedImages.forEach(img => {
                const count = img.meta?.items?.length || 0;
                let caseScore = 0;
                for (let i = 0; i < count; i++) {
                    caseScore += base + (remainder > 0 ? 1 : 0);
                    if (remainder > 0) remainder--;
                }
                scores.push(caseScore);
            });
        } else if (scoringRule === 'weighted' && totalExamWeight > 0) {
            let runningSum = 0;
            selectedImages.forEach((img, idx) => {
                if (idx === selectedImages.length - 1) {
                    scores.push(totalScore - runningSum);
                } else {
                    const caseWeight = (img.meta?.items || []).reduce((s, it) => s + (it.scoreWeight || 0), 0);
                    const caseScore = Math.floor((caseWeight / totalExamWeight) * totalScore);
                    scores.push(caseScore);
                    runningSum += caseScore;
                }
            });
        } else {
            selectedImages.forEach(() => scores.push(0));
        }
        return scores;
    }, [selectedImages, totalScore, scoringRule]);

    return (
        <div className="bg-white flex flex-col h-full rounded-l-xl">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between rounded-tl-xl border-t border-l border-gray-200">
                <h2 className="text-lg font-bold flex items-center text-gray-800">
                    <Layers className="w-5 h-5 mr-2 text-indigo-500" /> 组卷指挥官
                </h2>
            </div>

            <div className="flex-1 flex overflow-hidden border-l border-b border-gray-200">
                {/* Left: Library */}
                <div className="w-1/2 border-r border-gray-200 flex flex-col bg-white">
                    <div className="p-4 border-b space-y-3">
                        <div className="flex items-center space-x-2">
                            <h3 className="text-sm font-bold text-gray-700">可组卷案例库</h3>
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 rounded-full">{filteredImages.length} 份合格库</span>
                        </div>
                        <div className="flex space-x-2">
                            <div className="flex-1 relative">
                                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="关键字检索..."
                                    className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <select
                                className="w-[110px] sm:w-[130px] border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                value={filterScene}
                                onChange={e => setFilterScene(e.target.value)}
                            >
                                <option value="all">全业务</option>
                                {knowledgeTree.map(k => <option key={k.scene} value={k.scene}>{k.scene}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="p-4 flex-1 overflow-y-auto config-scrollbar">
                        {images.length === 0 && (
                            <div className="text-center py-16 px-6 text-sm text-gray-500 bg-amber-50 border border-amber-100 rounded-xl">
                                <p className="font-bold text-amber-800 mb-2">暂无可组卷案例</p>
                                <p className="leading-relaxed text-amber-900/80">
                                    请先到「图库标注」：上传现场图 → 框选隐患点并绑定条款 → 点击<strong>保存标注</strong>。
                                    保存成功后，此处会自动出现可勾选的案例。
                                </p>
                                <p className="text-xs text-amber-700/70 mt-3">若图库有图但此处为空，通常是标注未保存或标注数据已丢失，需重新标注。</p>
                            </div>
                        )}
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                            {filteredImages.map(img => {
                                const isSelected = !!selectedImages.find(s => s.name === img.name);
                                return (
                                    <div
                                        key={img.name}
                                        onClick={() => toggleSelect(img)}
                                        onMouseEnter={() => setActivePreview(img)}
                                        className={`border rounded p-2 cursor-pointer transition flex flex-col items-center justify-center relative h-28 bg-gray-50 hover:border-indigo-300
                                            ${isSelected ? 'border-indigo-500 shadow-[0_0_0_2px_rgba(99,102,241,0.3)] bg-indigo-50/20' : 'border-gray-200'}`}
                                    >
                                        <div className="absolute top-2 right-2 z-10">
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300 bg-white/80'}`}>
                                                {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                            </div>
                                        </div>
                                        <img src={img.url} alt="img" className="h-[4.5rem] w-auto object-contain mb-1 rounded opacity-90 shadow-sm border border-gray-200 bg-white" draggable={false} />
                                        <span className="text-[10px] truncate w-full text-center text-gray-600 font-medium px-1" title={img.originalName || img.baseName || img.name}>
                                            {img.baseName || img.originalName || img.name}
                                        </span>
                                    </div>
                                )
                            })}
                            {filteredImages.length === 0 && (
                                <div className="col-span-full py-8 text-center text-sm text-gray-400">
                                    没有符合筛选条件的受检资产...
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Assembly Details & Preview */}
                <div className="w-1/2 flex flex-col bg-gray-50/50 overflow-hidden min-h-0">
                    <div className="p-4 border-b flex-shrink-0 bg-white shadow-sm z-10">
                        <div className="space-y-3">
                            <div>
                                <input
                                    className="w-full border-b-2 border-transparent hover:border-gray-200 focus:border-indigo-500 bg-transparent px-2 py-1 text-base font-bold text-gray-800 placeholder-gray-400 focus:outline-none transition-colors"
                                    value={paperName}
                                    placeholder="输入测验活动名称..."
                                    onChange={e => setPaperName(e.target.value)}
                                />
                            </div>
                            <div>
                                <textarea
                                    className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500 h-[60px] resize-none config-scrollbar outline-none text-gray-600"
                                    value={paperDesc}
                                    placeholder="输入试卷寄语或考核说明..."
                                    onChange={e => setPaperDesc(e.target.value)}
                                />
                            </div>
                            <div className="pt-2 border-t border-gray-100 mt-2 grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">卷面总分 (Total)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                                        value={totalScore}
                                        onChange={e => setTotalScore(parseInt(e.target.value) || 0)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">赋分规则 (Rule)</label>
                                    <select
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                                        value={scoringRule}
                                        onChange={e => setScoringRule(e.target.value)}
                                    >
                                        <option value="weighted">比例赋分 (按权重倒挤)</option>
                                        <option value="average">均分赋分 (题内按点平摊)</option>
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">整卷限时 (秒，0=不限)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                                        value={timeLimitSec}
                                        onChange={e => setTimeLimitSec(parseInt(e.target.value) || 0)}
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-gray-100/50">
                        {/* 候选案例选定清单 */}
                        <div className="h-44 border-b border-gray-200 bg-white flex flex-col flex-shrink-0 relative z-10">
                            <div className="px-4 py-1.5 bg-indigo-50/70 border-b border-indigo-100 flex justify-between items-center text-xs font-bold text-indigo-800">
                                <span>已纳入本卷的考核清单</span>
                                <span className="bg-indigo-100 px-2 py-0.5 rounded-full ring-1 ring-indigo-200">共 {selectedImages.length} 题</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 config-scrollbar space-y-1.5">
                                {selectedImages.length === 0 ? (
                                    <div className="text-xs text-gray-400 text-center mt-6">在此展示您加入试卷的考题...</div>
                                ) : (
                                    selectedImages.map((img, i) => (
                                        <div
                                            key={img.name}
                                            className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100 hover:bg-white hover:border-indigo-200 hover:shadow-sm cursor-pointer transition text-sm group"
                                            onClick={() => setActivePreview(img)}
                                            onMouseEnter={() => setActivePreview(img)}
                                        >
                                            <div className="flex items-center flex-1 min-w-0">
                                                <span className="w-5 h-5 rounded bg-indigo-100 text-indigo-700 flex justify-center items-center text-[10px] font-bold mr-2 flex-shrink-0">{i + 1}</span>
                                                <span className="truncate flex-1 text-gray-700 font-medium text-xs" title={img.originalName || img.name}>
                                                    {img.baseName || img.originalName || img.name}
                                                </span>
                                            </div>
                                            <div className="flex items-center space-x-3 ml-2 flex-shrink-0">
                                                <span className="text-[10px] font-mono font-medium text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded-md flex items-center">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 mr-1.5"></span>
                                                    {img.meta?.items?.length || 0} 点 / {examScores[i]} 分
                                                </span>
                                                <button onClick={(e) => { e.stopPropagation(); toggleSelect(img); }} className="text-gray-300 group-hover:text-red-500 transition-colors p-0.5 rounded hover:bg-red-50" title="移除该题">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* 案例详情与视界预览区域 */}
                        <div className="flex-1 p-4 flex flex-col overflow-hidden min-h-0">
                            <h3 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide flex items-center shrink-0">
                                <Eye className="w-3.5 h-3.5 mr-1 text-indigo-400" /> 考题透视图 (含标准答案)
                            </h3>
                            <div className="flex-1 bg-gray-950 rounded-lg shadow-inner relative overflow-hidden select-none border border-gray-800 group min-h-0">
                                {!activePreview ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 text-xs">
                                        <Eye className="w-8 h-8 mb-2 opacity-30" />
                                        悬停题库或在选定清单点击，以透视标注指纹
                                    </div>
                                ) : (
                                    <div ref={containerRef} className="absolute inset-0 flex items-center justify-center p-2 overflow-hidden">
                                        <div className="relative shadow-md" style={previewStyle}>
                                            <img
                                                src={activePreview.url}
                                                alt="preview"
                                                className="block opacity-70 group-hover:opacity-100 transition-opacity w-full h-full object-contain"
                                                onLoad={handleImageLoad}
                                                draggable="false"
                                            />
                                            {/* Annotations */}
                                            {(activePreview.meta?.items || []).map((anno, i) => (
                                                <div
                                                    key={anno.id}
                                                    className="absolute pointer-events-none"
                                                    style={{
                                                        left: `${anno.rect.x * 100}%`, top: `${anno.rect.y * 100}%`,
                                                        width: `${anno.rect.w * 100}%`, height: `${anno.rect.h * 100}%`
                                                    }}
                                                >
                                                    <div className={`w-full h-full border-2 border-red-500 bg-red-500/10 shadow-[0_0_8px_rgba(239,68,68,0.5)] ${anno.shape === 'circle' ? 'rounded-full' : 'rounded-sm'}`} />
                                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-red-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap shadow-md">
                                                        #{i + 1} : {anno.scoreWeight}分
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-white border-t border-gray-200 mt-auto flex-shrink-0 flex items-center space-x-3">
                        <button
                            disabled={selectedImages.length === 0 || publishing}
                            onClick={() => handleSaveOrPublish('draft')}
                            className="flex-1 bg-white disabled:bg-gray-100 disabled:text-gray-400 text-indigo-600 font-bold py-3 text-sm rounded-xl shadow-sm hover:shadow-md hover:bg-gray-50 flex items-center justify-center transition-all disabled:cursor-not-allowed border border-indigo-200 disabled:border-gray-200"
                        >
                            {publishing ? '处理中…' : `保存草稿 (${selectedImages.length})`}
                        </button>
                        <button
                            disabled={selectedImages.length === 0 || publishing}
                            onClick={() => handleSaveOrPublish('published')}
                            className="flex-1 bg-indigo-600 disabled:bg-gray-300 disabled:text-gray-500 text-white font-bold py-3 text-sm rounded-xl shadow-md hover:shadow-lg hover:bg-indigo-700 flex items-center justify-center transition-all disabled:cursor-not-allowed border border-transparent disabled:border-gray-200"
                        >
                            <FilePlus2 className="w-5 h-5 mr-2" /> {publishing ? '处理中…' : '发布试卷'}
                        </button>
                    </div>
                </div>
            </div>
            {toast.show && (
                <div className={`fixed bottom-8 right-8 z-[100] px-5 py-3 rounded-xl shadow-xl text-sm font-bold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    {toast.message}
                </div>
            )}
        </div>
    );
}
