import React, { useEffect, useMemo, useState } from 'react';
import { Users, Building2, Plus, Trash2, Save, UserPlus, Pencil, X, RotateCcw } from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog';

/** 将扁平部门列表展开为带层级前缀的选项（深度优先） */
function buildDeptOptions(depts, parentId = null, depth = 0, acc = []) {
    const nodes = depts
        .filter(d => (d.parent_id || null) === parentId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'zh'));
    for (const d of nodes) {
        const pad = depth === 0 ? '' : `${'　'.repeat(depth)}└ `;
        acc.push({
            id: d.id,
            name: d.name,
            parent_id: d.parent_id || null,
            depth,
            label: `${pad}${d.name}`
        });
        buildDeptOptions(depts, d.id, depth + 1, acc);
    }
    return acc;
}

function isDescendant(depts, ancestorId, nodeId) {
    let cursor = nodeId;
    const seen = new Set();
    while (cursor) {
        if (cursor === ancestorId) return true;
        if (seen.has(cursor)) break;
        seen.add(cursor);
        cursor = depts.find(d => d.id === cursor)?.parent_id || null;
    }
    return false;
}

function DeptTree({ depts, selectedDept, onSelect, onEdit, onDelete, parentId = null, depth = 0 }) {
    const nodes = depts
        .filter(d => (d.parent_id || null) === parentId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'zh'));
    return (
        <>
            {nodes.map(d => (
                <div key={d.id}>
                    <div className="flex items-center group" style={{ paddingLeft: depth * 12 }}>
                        <button
                            type="button"
                            onClick={() => onSelect(d.id)}
                            className={`flex-1 text-left text-sm px-2 py-1.5 rounded min-w-0 truncate ${
                                selectedDept === d.id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-gray-50'
                            }`}
                        >
                            {depth > 0 ? '└ ' : ''}{d.name}
                        </button>
                        <button
                            type="button"
                            onClick={() => onEdit(d)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-indigo-500 hover:text-indigo-700"
                            title="编辑部门"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onDelete(d.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600"
                            title="删除部门"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <DeptTree
                        depts={depts}
                        selectedDept={selectedDept}
                        onSelect={onSelect}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        parentId={d.id}
                        depth={depth + 1}
                    />
                </div>
            ))}
        </>
    );
}

const emptyUserForm = {
    id: null,
    username: '',
    password: '',
    real_name: '',
    employee_no: '',
    mobile: '',
    department_id: '',
    role: 'trainee',
    job_title: '',
    status: 'active'
};

export default function PersonnelManager() {
    const [org, setOrg] = useState(null);
    const [depts, setDepts] = useState([]);
    const [users, setUsers] = useState([]);
    const [selectedDept, setSelectedDept] = useState(null);
    const [q, setQ] = useState('');
    const [msg, setMsg] = useState('');
    const [msgType, setMsgType] = useState('ok');
    const [confirmAct, setConfirmAct] = useState(null);

    // 部门：新建 / 编辑
    const [deptMode, setDeptMode] = useState('create'); // create | edit
    const [editingDeptId, setEditingDeptId] = useState(null);
    const [deptName, setDeptName] = useState('');
    const [deptParent, setDeptParent] = useState('');

    // 人员：新建 / 编辑
    const [userMode, setUserMode] = useState('create'); // create | edit
    const [form, setForm] = useState(emptyUserForm);

    const deptOptions = useMemo(() => buildDeptOptions(depts), [depts]);

    // 编辑部门时，上级候选排除自己及子孙
    const deptParentOptions = useMemo(() => {
        if (deptMode !== 'edit' || !editingDeptId) return deptOptions;
        return deptOptions.filter(o =>
            o.id !== editingDeptId && !isDescendant(depts, editingDeptId, o.id)
        );
    }, [deptOptions, depts, deptMode, editingDeptId]);

    const toast = (t, type = 'ok') => {
        setMsg(t);
        setMsgType(type);
        setTimeout(() => setMsg(''), 3500);
    };

    const load = async () => {
        try {
            const qs = new URLSearchParams();
            if (selectedDept) qs.set('department_id', selectedDept);
            if (q.trim()) qs.set('q', q.trim());
            const [oRes, dRes, uRes] = await Promise.all([
                fetch('/api/org'),
                fetch('/api/org/departments'),
                fetch(`/api/org/users?${qs}`)
            ]);
            if (!dRes.ok) throw new Error('加载部门失败');
            const o = oRes.ok ? await oRes.json() : null;
            const d = await dRes.json();
            const u = uRes.ok ? await uRes.json() : [];
            setOrg(o);
            setDepts(Array.isArray(d) ? d : []);
            setUsers(Array.isArray(u) ? u : []);
        } catch (e) {
            console.error(e);
            toast(e.message || '加载失败', 'err');
        }
    };

    useEffect(() => { load(); }, [selectedDept]);

    const resetDeptForm = () => {
        setDeptMode('create');
        setEditingDeptId(null);
        setDeptName('');
        setDeptParent('');
    };

    const startEditDept = (d) => {
        setDeptMode('edit');
        setEditingDeptId(d.id);
        setDeptName(d.name || '');
        setDeptParent(d.parent_id || '');
    };

    const saveDept = async () => {
        if (!deptName.trim()) {
            toast('请输入部门名称', 'err');
            return;
        }
        try {
            if (deptMode === 'edit' && editingDeptId) {
                const res = await fetch(`/api/org/departments/${editingDeptId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: deptName.trim(),
                        parent_id: deptParent || null
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    toast(data.error || `保存失败 (${res.status})`, 'err');
                    return;
                }
                toast(`部门「${deptName.trim()}」已更新`);
                resetDeptForm();
            } else {
                const res = await fetch('/api/org/departments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: deptName.trim(),
                        parent_id: deptParent || null
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    toast(data.error || `添加失败 (${res.status})`, 'err');
                    return;
                }
                toast(`部门「${data.name}」已添加`);
                resetDeptForm();
            }
            await load();
        } catch (e) {
            toast(e.message || '网络错误', 'err');
        }
    };

    const delDept = (id) => {
        setConfirmAct({
            title: '删除部门',
            message: '删除该部门？下属人员将取消部门绑定。',
            run: async () => {
                setConfirmAct(null);
                try {
                    const res = await fetch(`/api/org/departments/${id}`, { method: 'DELETE' });
                    const e = await res.json().catch(() => ({}));
                    if (!res.ok) toast(e.error || '删除失败', 'err');
                    else {
                        if (selectedDept === id) setSelectedDept(null);
                        if (editingDeptId === id) resetDeptForm();
                        toast('已删除');
                        load();
                    }
                } catch (e) {
                    toast(e.message || '网络错误', 'err');
                }
            }
        });
    };

    const resetUserForm = () => {
        setUserMode('create');
        setForm({ ...emptyUserForm, department_id: selectedDept || '' });
    };

    const startEditUser = (u) => {
        setUserMode('edit');
        setForm({
            id: u.id,
            username: u.username || '',
            password: '',
            real_name: u.real_name || '',
            employee_no: u.employee_no || '',
            mobile: u.mobile || '',
            department_id: u.department_id || '',
            role: u.role || 'trainee',
            job_title: u.job_title || '',
            status: u.status || 'active'
        });
        // 滚到表单
        setTimeout(() => {
            document.getElementById('user-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
    };

    const saveUser = async (e) => {
        e.preventDefault();
        try {
            if (userMode === 'edit' && form.id) {
                const body = {
                    username: form.username.trim(),
                    real_name: form.real_name.trim(),
                    employee_no: form.employee_no,
                    mobile: form.mobile,
                    department_id: form.department_id || null,
                    role: form.role,
                    job_title: form.job_title,
                    status: form.status
                };
                if (form.password.trim()) body.password = form.password.trim();

                const res = await fetch(`/api/org/users/${form.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) { toast(data.error || '保存失败', 'err'); return; }
                toast('人员信息已更新');
                resetUserForm();
            } else {
                if (!form.password.trim()) {
                    toast('新建人员必须设置初始密码', 'err');
                    return;
                }
                const res = await fetch('/api/org/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: form.username.trim(),
                        password: form.password.trim(),
                        real_name: form.real_name.trim(),
                        employee_no: form.employee_no,
                        mobile: form.mobile,
                        department_id: form.department_id || null,
                        role: form.role,
                        job_title: form.job_title
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) { toast(data.error || '创建失败', 'err'); return; }
                toast('用户已创建，可用该账号在学员端登录');
                resetUserForm();
            }
            load();
        } catch (err) {
            toast(err.message || '网络错误', 'err');
        }
    };

    const disableUser = (id) => {
        setConfirmAct({
            title: '禁用账号',
            message: '禁用该账号？（成绩记录保留）',
            run: async () => {
                setConfirmAct(null);
                await fetch(`/api/org/users/${id}`, { method: 'DELETE' });
                toast('已禁用');
                if (form.id === id) resetUserForm();
                load();
            }
        });
    };

    const enableUser = async (id) => {
        const res = await fetch(`/api/org/users/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'active' })
        });
        if (res.ok) {
            toast('已重新启用');
            load();
        } else {
            const data = await res.json().catch(() => ({}));
            toast(data.error || '启用失败', 'err');
        }
    };

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center text-gray-800">
                    <Users className="w-5 h-5 mr-2 text-indigo-500" /> 人员与组织
                </h2>
                <span className="text-xs text-gray-500">{org?.name || '默认企业'} · 支持部门/人员编辑</span>
            </div>
            {msg && (
                <div className={`mx-4 mt-3 text-sm px-3 py-2 rounded-lg ${msgType === 'err' ? 'bg-red-50 text-red-700' : 'bg-indigo-50 text-indigo-700'}`}>
                    {msg}
                </div>
            )}

            <div className="flex-1 flex min-h-0">
                {/* 部门 */}
                <div className="w-80 border-r p-4 flex flex-col">
                    <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
                        <Building2 className="w-4 h-4 mr-1" /> 部门（多级）
                    </h3>
                    <button
                        type="button"
                        onClick={() => setSelectedDept(null)}
                        className={`text-left text-sm px-2 py-1.5 rounded mb-1 ${!selectedDept ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-gray-50'}`}
                    >
                        全部人员
                    </button>
                    <div className="flex-1 overflow-y-auto">
                        <DeptTree
                            depts={depts}
                            selectedDept={selectedDept}
                            onSelect={setSelectedDept}
                            onEdit={startEditDept}
                            onDelete={delDept}
                        />
                        {depts.length === 0 && (
                            <p className="text-xs text-gray-400 mt-4">暂无部门，请在下方添加</p>
                        )}
                    </div>

                    <div className="mt-auto pt-3 border-t space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-gray-600">
                            <span>{deptMode === 'edit' ? '编辑部门' : '新建部门'}</span>
                            {deptMode === 'edit' && (
                                <button type="button" onClick={resetDeptForm} className="text-gray-400 hover:text-gray-700 flex items-center gap-0.5">
                                    <X className="w-3.5 h-3.5" /> 取消
                                </button>
                            )}
                        </div>
                        <input
                            value={deptName}
                            onChange={e => setDeptName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveDept()}
                            placeholder="部门名称"
                            className="w-full border rounded-lg px-2 py-1.5 text-sm"
                        />
                        <select
                            value={deptParent}
                            onChange={e => setDeptParent(e.target.value)}
                            className="w-full border rounded-lg px-2 py-1.5 text-sm font-mono"
                        >
                            <option value="">作为顶级部门</option>
                            {deptParentOptions.map(o => (
                                <option key={o.id} value={o.id}>{o.label}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={saveDept}
                            className="w-full bg-indigo-600 text-white text-sm font-bold py-2 rounded-lg flex items-center justify-center hover:bg-indigo-500"
                        >
                            {deptMode === 'edit' ? (
                                <><Save className="w-4 h-4 mr-1" /> 保存部门</>
                            ) : (
                                <><Plus className="w-4 h-4 mr-1" /> 添加部门</>
                            )}
                        </button>
                    </div>
                </div>

                {/* 人员 */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="p-3 border-b flex gap-2">
                        <input
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && load()}
                            placeholder="搜索姓名/工号/用户名"
                            className="flex-1 border rounded-lg px-3 py-2 text-sm"
                        />
                        <button type="button" onClick={load} className="px-4 py-2 bg-gray-100 rounded-lg text-sm font-bold">搜索</button>
                        <label className="px-3 py-2 border rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap">
                            导入 CSV
                            <input
                                type="file"
                                accept=".csv,text/csv"
                                className="hidden"
                                onChange={async (e) => {
                                    const f = e.target.files?.[0];
                                    if (!f) return;
                                    const fd = new FormData();
                                    fd.append('file', f);
                                    const res = await fetch('/api/admin/personnel/import', { method: 'POST', body: fd });
                                    const d = await res.json().catch(() => ({}));
                                    if (res.ok) toast(`导入 ${d.created} 人` + (d.skipped?.length ? `，跳过 ${d.skipped.length}` : ''));
                                    else toast(d.error || '导入失败', 'err');
                                    e.target.value = '';
                                    load();
                                }}
                            />
                        </label>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b">
                                    <th className="pb-2">姓名</th>
                                    <th className="pb-2">用户名</th>
                                    <th className="pb-2">工号</th>
                                    <th className="pb-2">部门</th>
                                    <th className="pb-2">角色</th>
                                    <th className="pb-2">状态</th>
                                    <th className="pb-2 text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id} className={`border-b border-gray-50 hover:bg-gray-50 ${form.id === u.id ? 'bg-indigo-50/40' : ''}`}>
                                        <td className="py-2 font-medium">{u.real_name}</td>
                                        <td className="py-2 font-mono text-xs">{u.username}</td>
                                        <td className="py-2">{u.employee_no || '—'}</td>
                                        <td className="py-2">{u.department_name || '—'}</td>
                                        <td className="py-2">
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100">{u.role}</span>
                                        </td>
                                        <td className="py-2">
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                                                {u.status}
                                            </span>
                                        </td>
                                        <td className="py-2 text-right space-x-2 whitespace-nowrap">
                                            <button
                                                type="button"
                                                onClick={() => startEditUser(u)}
                                                className="text-indigo-500 hover:text-indigo-700 text-xs font-bold inline-flex items-center gap-0.5"
                                            >
                                                <Pencil className="w-3 h-3" /> 编辑
                                            </button>
                                            {u.status === 'active' ? (
                                                u.username !== 'admin' && (
                                                    <button type="button" onClick={() => disableUser(u.id)} className="text-red-400 hover:text-red-600 text-xs">禁用</button>
                                                )
                                            ) : (
                                                <button type="button" onClick={() => enableUser(u.id)} className="text-emerald-600 hover:text-emerald-700 text-xs inline-flex items-center gap-0.5">
                                                    <RotateCcw className="w-3 h-3" /> 启用
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {users.length === 0 && (
                                    <tr><td colSpan={7} className="py-10 text-center text-gray-400">暂无人员，请在下方创建</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <form id="user-form-panel" onSubmit={saveUser} className="p-4 border-t bg-gray-50 grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="col-span-2 md:col-span-4 flex items-center justify-between text-xs font-bold text-gray-600 mb-1">
                            <span className="flex items-center">
                                {userMode === 'edit' ? (
                                    <><Pencil className="w-4 h-4 mr-1" /> 编辑人员</>
                                ) : (
                                    <><UserPlus className="w-4 h-4 mr-1" /> 新建人员（可用于学员端登录）</>
                                )}
                            </span>
                            {userMode === 'edit' && (
                                <button type="button" onClick={resetUserForm} className="text-gray-400 hover:text-gray-700 flex items-center gap-0.5 font-medium">
                                    <X className="w-3.5 h-3.5" /> 取消编辑
                                </button>
                            )}
                        </div>
                        <input
                            required
                            value={form.real_name}
                            onChange={e => setForm({ ...form, real_name: e.target.value })}
                            placeholder="真实姓名 *"
                            className="border rounded-lg px-2 py-2 text-sm"
                        />
                        <input
                            required
                            value={form.username}
                            onChange={e => setForm({ ...form, username: e.target.value })}
                            placeholder="登录用户名 *"
                            className="border rounded-lg px-2 py-2 text-sm"
                        />
                        <input
                            type="password"
                            required={userMode === 'create'}
                            value={form.password}
                            onChange={e => setForm({ ...form, password: e.target.value })}
                            placeholder={userMode === 'edit' ? '新密码（留空不改）' : '初始密码 *'}
                            className="border rounded-lg px-2 py-2 text-sm"
                        />
                        <input
                            value={form.employee_no}
                            onChange={e => setForm({ ...form, employee_no: e.target.value })}
                            placeholder="工号"
                            className="border rounded-lg px-2 py-2 text-sm"
                        />

                        {/* 分级部门选择 */}
                        <select
                            value={form.department_id}
                            onChange={e => setForm({ ...form, department_id: e.target.value })}
                            className="border rounded-lg px-2 py-2 text-sm col-span-2"
                            title="按组织层级显示"
                        >
                            <option value="">选择部门（可选）</option>
                            {deptOptions.map(o => (
                                <option key={o.id} value={o.id}>
                                    {o.label}
                                </option>
                            ))}
                        </select>

                        <select
                            value={form.role}
                            onChange={e => setForm({ ...form, role: e.target.value })}
                            className="border rounded-lg px-2 py-2 text-sm"
                        >
                            <option value="trainee">学员 trainee</option>
                            <option value="trainer">培训员 trainer</option>
                            <option value="admin">管理员 admin</option>
                        </select>

                        {userMode === 'edit' ? (
                            <select
                                value={form.status}
                                onChange={e => setForm({ ...form, status: e.target.value })}
                                className="border rounded-lg px-2 py-2 text-sm"
                            >
                                <option value="active">启用 active</option>
                                <option value="disabled">禁用 disabled</option>
                            </select>
                        ) : (
                            <input
                                value={form.mobile}
                                onChange={e => setForm({ ...form, mobile: e.target.value })}
                                placeholder="手机"
                                className="border rounded-lg px-2 py-2 text-sm"
                            />
                        )}

                        {userMode === 'edit' && (
                            <input
                                value={form.mobile}
                                onChange={e => setForm({ ...form, mobile: e.target.value })}
                                placeholder="手机"
                                className="border rounded-lg px-2 py-2 text-sm"
                            />
                        )}
                        <input
                            value={form.job_title}
                            onChange={e => setForm({ ...form, job_title: e.target.value })}
                            placeholder="岗位"
                            className="border rounded-lg px-2 py-2 text-sm"
                        />

                        <button
                            type="submit"
                            className="bg-indigo-600 text-white font-bold rounded-lg text-sm flex items-center justify-center hover:bg-indigo-500 md:col-span-2"
                        >
                            <Save className="w-4 h-4 mr-1" />
                            {userMode === 'edit' ? '保存修改' : '创建人员'}
                        </button>
                    </form>
                </div>
            </div>
            <ConfirmDialog
                open={!!confirmAct}
                title={confirmAct?.title}
                message={confirmAct?.message}
                danger
                onCancel={() => setConfirmAct(null)}
                onConfirm={() => confirmAct?.run?.()}
            />
        </div>
    );
}
