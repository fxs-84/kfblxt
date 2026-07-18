/**
 * 发起兑换订单 — 治疗师帮客户(或客户自用)选择商品并创建兑换单
 * 流程: 选商品 → 显示所需积分 / 客户余额 → 校验 → 扣分 + 创建 pending 兑换单
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { usePatients } from "../../patients/usePatients";
import { useSession } from "../../../components/auth/useSession";
import {
  appendLog,
  createRedemption,
  findAllRewards,
  getOrCreateMembership,
  updateMembership,
} from "../rule.repository";
import {
  REWARD_CATEGORY_LABEL,
  type PatientMembership,
  type PointsLog,
  type Redemption,
  type RewardCategory,
  type RewardProduct,
} from "../models";

export function RedeemCreatePage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { data: patients = [] } = usePatients();
  const session = useSession();

  const [rewards, setRewards] = useState<RewardProduct[]>([]);
  const [membership, setMembership] = useState<PatientMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<RewardCategory | "all">("all");

  useEffect(() => {
    if (!patientId) return;
    void (async () => {
      setLoading(true);
      const [rw, m] = await Promise.all([
        findAllRewards(),
        getOrCreateMembership(patientId),
      ]);
      setRewards(rw.filter(r => r.enabled));
      setMembership(m);
      setLoading(false);
    })();
  }, [patientId]);

  const patient = patients.find(p => p.id === patientId);
  const filteredRewards = useMemo(
    () => categoryFilter === "all" ? rewards : rewards.filter(r => r.category === categoryFilter),
    [rewards, categoryFilter],
  );

  const selectedReward = useMemo(
    () => rewards.find(r => r.id === selectedRewardId) ?? null,
    [rewards, selectedRewardId],
  );

  const tier = useMemo(() => {
    if (!membership) return null;
    // 简单匹配:tierRequired 是会员等级,patient 的 tier 要达到才允许兑换
    return membership.tier;
  }, [membership]);

  const insufficientPoints = !!selectedReward && !!membership && membership.points < selectedReward.pointsCost;
  const tierBlocked = !!selectedReward && !!selectedReward.tierRequired && tier !== selectedReward.tier;
  const stockExhausted = !!selectedReward && selectedReward.stock === 0;
  const canSubmit = !!selectedReward && !insufficientPoints && !tierBlocked && !stockExhausted && !submitting;

  const handleSubmit = async () => {
    if (!selectedReward || !membership || !patientId) return;
    setSubmitting(true);
    setError(null);
    try {
      const newBalance = membership.points - selectedReward.pointsCost;

      // 1. 创建兑换单(pending 状态)
      const redemption: Redemption = {
        id: `red_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        patientId,
        rewardId: selectedReward.id,
        rewardName: selectedReward.name,
        pointsCost: selectedReward.pointsCost,
        status: "pending",
        notes: notes.trim() || null,
        operatorId: session.userId,
        createdAt: new Date().toISOString(),
        fulfilledAt: null,
        cancelledAt: null,
      };
      await createRedemption(redemption);

      // 2. 扣减积分 + 累计消费
      await updateMembership(patientId, {
        points: newBalance,
        totalSpent: membership.totalSpent + selectedReward.pointsCost,
      });

      // 3. 写积分流水
      const log: PointsLog = {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        patientId,
        delta: -selectedReward.pointsCost,
        balanceAfter: newBalance,
        reason: `兑换商品: ${selectedReward.name}`,
        ruleId: null,
        triggerType: null,
        refType: "manual",
        refId: redemption.id,
        operatorId: session.userId,
        createdAt: new Date().toISOString(),
      };
      await appendLog(log);

      navigate("/membership/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  if (loading) return <div style={{ padding: 24 }}>加载中…</div>;
  if (!membership) return <div style={{ padding: 24 }}>未找到该客户的会员信息</div>;

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <div style={{ marginBottom: 16 }}>
        <Link to="/membership/dashboard" style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          ← 返回会员中心
        </Link>
      </div>

      <div className="card panel" style={{ marginBottom: 16 }}>
        <div className="panel__head">
          <h2 className="panel__title">🎁 发起兑换 — {patient?.name ?? patientId}</h2>
        </div>
        <div style={{ display: "flex", gap: 24, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>可用积分</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--color-accent)" }} data-testid="available-points">
              {membership.points.toLocaleString()}
            </div>
          </div>
          {selectedReward && (
            <>
              <div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>本次消耗</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#ef4444" }}>
                  -{selectedReward.pointsCost.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>兑换后余额</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>
                  {(membership.points - selectedReward.pointsCost).toLocaleString()}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 分类筛选 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <button type="button"
 onClick={() => setCategoryFilter("all")}
          className={`btn ${categoryFilter === "all" ? "btn--primary" : "btn--ghost"}`}
          style={{ fontSize: 12, padding: "4px 10px" }}
        >
          全部
        </button>
        {(Object.keys(REWARD_CATEGORY_LABEL) as RewardCategory[]).map(cat => (
          <button type="button"
            key={cat} onClick={() => setCategoryFilter(cat)}
            className={`btn ${categoryFilter === cat ? "btn--primary" : "btn--ghost"}`}
            style={{ fontSize: 12, padding: "4px 10px" }}
          >
            {REWARD_CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>

      {/* 商品网格 */}
      <div className="card panel" style={{ marginBottom: 16 }}>
        <div className="panel__head">
          <h3 className="panel__title">🎁 选择商品</h3>
        </div>
        {filteredRewards.length === 0 ? (
          <div className="empty">该分类下暂无商品,请先到"商品管理"添加</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {filteredRewards.map(r => {
              const selected = r.id === selectedRewardId;
              const blocked = membership.points < r.pointsCost
                || (r.tierRequired && tier !== r.tierRequired)
                || r.stock === 0;
              return (
                <button type="button"
                  key={r.id} onClick={() => setSelectedRewardId(r.id)}
                  disabled={blocked}
                  data-testid={`reward-${r.id}`}
                  style={{
                    padding: 12, textAlign: "left", cursor: blocked ? "not-allowed" : "pointer",
                    border: selected ? "2px solid var(--color-accent)" : "1px solid var(--color-border)",
                    borderRadius: 8, opacity: blocked ? 0.5 : 1,
                    background: selected ? "var(--color-surface-sunken, #f5f7fa)" : "transparent",
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 4 }}>{r.imageEmoji}</div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 4 }}>
                    {REWARD_CATEGORY_LABEL[r.category]}
                    {r.tierRequired && ` · ${r.tierRequired} 专享`}
                    {r.stock >= 0 && ` · 库存 ${r.stock}`}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-accent)" }}>
                    {r.pointsCost.toLocaleString()} 积分
                  </div>
                  {blocked && (
                    <div style={{ fontSize: 10, color: "#ef4444", marginTop: 4 }}>
                      {membership.points < r.pointsCost ? "积分不足" :
                       r.tierRequired && tier !== r.tierRequired ? `需 ${r.tierRequired} 等级` :
                       "已售罄"}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 备注 + 提交 */}
      {selectedReward && (
        <div className="card panel" data-testid="redeem-summary">
          <div className="panel__head">
            <h3 className="panel__title">📝 兑换单详情</h3>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, marginBottom: 4 }}>
              <strong>商品:</strong> {selectedReward.imageEmoji} {selectedReward.name}
            </div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>
              <strong>消耗积分:</strong> <span style={{ color: "#ef4444" }}>{selectedReward.pointsCost.toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 13 }}>
              <strong>说明:</strong> {selectedReward.description || "—"}
            </div>
          </div>
          <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "var(--color-text-muted)" }}>
            备注 (可选,例如"生日礼物"或"康复奖励"):
          </label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="备注…"
            maxLength={100}
            style={{
              width: "100%", padding: "6px 10px", fontSize: 13,
              border: "1px solid var(--color-border)", borderRadius: 4, marginBottom: 12,
            }}
          />
          {error && (
            <div style={{ padding: 8, background: "#fee2e2", color: "#991b1b", borderRadius: 4, marginBottom: 12, fontSize: 13 }}>
              {error}
            </div>
          )}
          <button type="button"
 onClick={handleSubmit}
            disabled={!canSubmit}
            className="btn btn--primary"
            style={{ width: "100%", padding: "10px", fontSize: 14 }}
            data-testid="submit-redemption"
          >
            {submitting ? "提交中…" : `提交兑换单(扣 ${selectedReward.pointsCost.toLocaleString()} 积分)`}
          </button>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 8, textAlign: "center" }}>
            提交后状态为"待审核",由管理员在兑换审核页确认发放
          </div>
        </div>
      )}
    </div>
  );
}