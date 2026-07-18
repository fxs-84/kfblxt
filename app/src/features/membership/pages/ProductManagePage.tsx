/**
 * 商品管理页 — CRUD
 */
import { useEffect, useState } from "react";
import {
  findAllRewards,
  createReward,
  updateReward,
  deleteReward,
  findAllTiers,
} from "../rule.repository";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import {
  REWARD_CATEGORY_LABEL,
  REWARD_CATEGORIES,
  type RewardProduct,
  type TierConfig,
  type RewardCategory,
} from "../models";

const EMOJI_OPTIONS = ["🎁", "🩰", "💿", "📞", "💬", "🎟️", "🎫", "👨‍⚕️", "📋", "🧘", "🏋️", "🎯", "🧴"];

export function ProductManagePage() {
  const [products, setProducts] = useState<RewardProduct[]>([]);
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [editing, setEditing] = useState<RewardProduct | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const reload = async () => {
    setProducts(await findAllRewards());
    setTiers(await findAllTiers());
  };

  useEffect(() => { void reload(); }, []);

  const save = async (p: RewardProduct) => {
    if (products.find(x => x.id === p.id)) {
      await updateReward(p.id, p);
    } else {
      await createReward(p);
    }
    await reload();
    setEditing(null);
    setShowForm(false);
  };

  const remove = async (id: string) => {
    setPendingDelete(id);
  };

  const toggle = async (p: RewardProduct) => {
    await updateReward(p.id, { enabled: !p.enabled });
    await reload();
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>商品管理 ({products.length})</h2>
        <button type="button" onClick={() => {
          setEditing({
            id: `reward_${Date.now()}`,
            name: "新商品",
            description: "",
            category: "training",
            pointsCost: 500,
            imageEmoji: "🎁",
            stock: -1,
            tierRequired: null,
            enabled: true,
            createdAt: new Date().toISOString(),
          });
          setShowForm(true);
        }} style={{
          padding: "6px 14px", background: "var(--color-accent)",
          color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600,
        }}>+ 新建商品</button>
      </div>

      {showForm && editing && (
        <ProductForm product={editing} tiers={tiers} onSave={save} onCancel={() => { setShowForm(false); setEditing(null); }} />
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
            <th style={{ textAlign: "left", padding: 8 }}>商品</th>
            <th style={{ textAlign: "left", padding: 8 }}>分类</th>
            <th style={{ textAlign: "right", padding: 8 }}>积分</th>
            <th style={{ textAlign: "left", padding: 8 }}>等级要求</th>
            <th style={{ textAlign: "right", padding: 8 }}>库存</th>
            <th style={{ textAlign: "center", padding: 8 }}>启用</th>
            <th style={{ textAlign: "right", padding: 8 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => {
            const tier = p.tierRequired ? tiers.find(t => t.tier === p.tierRequired) : null;
            return (
              <tr key={p.id} style={{ borderBottom: "1px solid var(--color-border)", opacity: p.enabled ? 1 : 0.5 }}>
                <td style={{ padding: 8 }}>
                  <span style={{ fontSize: 18, marginRight: 6 }}>{p.imageEmoji}</span>
                  <strong>{p.name}</strong>
                </td>
                <td style={{ padding: 8 }}>{REWARD_CATEGORY_LABEL[p.category]}</td>
                <td style={{ padding: 8, textAlign: "right", fontWeight: 600 }}>{p.pointsCost}</td>
                <td style={{ padding: 8 }}>{tier ? <>{tier.icon} {tier.name}</> : <span style={{ color: "var(--color-text-muted)" }}>不限</span>}</td>
                <td style={{ padding: 8, textAlign: "right" }}>{p.stock === -1 ? "∞" : p.stock}</td>
                <td style={{ padding: 8, textAlign: "center" }}>
                  <input type="checkbox" checked={p.enabled} onChange={() => toggle(p)} />
                </td>
                <td style={{ padding: 8, textAlign: "right" }}>
                  <button type="button" onClick={() => { setEditing(p); setShowForm(true); }} style={{ padding: "3px 10px", fontSize: 11, background: "transparent", border: "1px solid var(--color-border)", borderRadius: 4, marginRight: 4, cursor: "pointer" }}>编辑</button>
                  <button type="button" onClick={() => remove(p.id)} style={{ padding: "3px 10px", fontSize: 11, background: "transparent", border: "1px solid var(--color-abnormal)", color: "var(--color-abnormal)", borderRadius: 4, cursor: "pointer" }}>删除</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除商品"
        message="确定删除该商品？删除后无法恢复。"
        confirmLabel="删除"
        danger
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) {
            await deleteReward(pendingDelete);
            await reload();
          }
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

function ProductForm({ product, tiers, onSave, onCancel }: {
  product: RewardProduct;
  tiers: TierConfig[];
  onSave: (p: RewardProduct) => Promise<void>;
  onCancel: () => void;
}) {
  const [edit, setEdit] = useState(product);

  return (
    <div style={{ padding: 16, border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 16, background: "var(--color-surface-sunken, #f9fafb)" }}>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr 1fr" }}>
        <Field label="商品名称">
          <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="分类">
          <select value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value as RewardCategory })} style={inputStyle}>
            {REWARD_CATEGORIES.map(c => <option key={c} value={c}>{REWARD_CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label="积分">
          <input type="number" value={edit.pointsCost} onChange={e => setEdit({ ...edit, pointsCost: parseInt(e.target.value, 10) || 0 })} style={inputStyle} />
        </Field>
        <Field label="描述">
          <input value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="等级要求">
          <select value={edit.tierRequired ?? ""} onChange={e => setEdit({ ...edit, tierRequired: (e.target.value as RewardProduct["tierRequired"]) || null })} style={inputStyle}>
            <option value="">不限</option>
            {tiers.map(t => <option key={t.tier} value={t.tier}>{t.icon} {t.name}</option>)}
          </select>
        </Field>
        <Field label="库存(-1=无限)">
          <input type="number" value={edit.stock} onChange={e => setEdit({ ...edit, stock: parseInt(e.target.value, 10) || -1 })} style={inputStyle} />
        </Field>
        <Field label="图标">
          <select value={edit.imageEmoji} onChange={e => setEdit({ ...edit, imageEmoji: e.target.value })} style={inputStyle}>
            {EMOJI_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </Field>
        <Field label="启用">
          <input type="checkbox" checked={edit.enabled} onChange={e => setEdit({ ...edit, enabled: e.target.checked })} />
        </Field>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
        <button type="button" onClick={() => onSave(edit)} style={{ padding: "6px 14px", background: "var(--color-accent)", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600 }}>保存</button>
        <button type="button" onClick={onCancel} style={{ padding: "6px 14px", background: "transparent", border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer" }}>取消</button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid var(--color-border)", borderRadius: 4, fontFamily: "inherit" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 2, color: "var(--color-text-muted)" }}>{label}</label>
      {children}
    </div>
  );
}