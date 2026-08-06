import type { RunState } from "@/lib/types";

/**
 * The pipeline as a picture instead of a list of cards.
 *
 * One crawl, one clean, then three lanes that differ *only* in the quality of
 * the dataset that gets indexed. Everything downstream is identical, which is
 * the whole argument of the lab — so the diagram draws it that way.
 *
 * Node state is passed in by the page from the real artifact index; this file
 * decides geometry and nothing else.
 */

export interface FlowNode {
  done: boolean;
  present: number;
  total: number;
}

export interface FlowGate {
  state: string;
  status: string | null;
  passed: boolean | null;
}

const LANES: {
  state: RunState;
  y: number;
  action: string;
  actionSub: string;
  fill: string;
  soft: string;
  actionKey: string | null;
  indexKey: string;
  evalKey: string;
}[] = [
  {
    state: "baseline",
    y: 72,
    action: "dataset sạch",
    actionSub: "không đụng vào",
    fill: "var(--color-brand-blue-600)",
    soft: "var(--color-brand-blue-50)",
    actionKey: null,
    indexKey: "index_baseline",
    evalKey: "evaluate_baseline",
  },
  {
    state: "corrupted",
    y: 210,
    action: "corrupt",
    actionSub: "bơm lỗi có chủ đích",
    fill: "var(--color-brand-red)",
    soft: "var(--color-brand-red-50)",
    actionKey: "corrupt",
    indexKey: "index_corrupted",
    evalKey: "evaluate_corrupted",
  },
  {
    state: "repaired",
    y: 348,
    action: "repair",
    actionSub: "clean lại từ raw",
    fill: "var(--color-ok)",
    soft: "var(--color-ok-50)",
    actionKey: "repair",
    indexKey: "index_repaired",
    evalKey: "evaluate_repaired",
  },
];

const BOX_H = 76;
const SOURCE = { x: 16, w: 132 };
const CRAWL = { x: 178, w: 150 };
const CLEAN = { x: 358, w: 150 };
const COL_ACTION = { x: 560, w: 175 };
const COL_INDEX = { x: 785, w: 145 };
const COL_EVAL = { x: 980, w: 175 };
const COMPARE = { x: 1205, w: 220, y: 34, h: 392 };

export function PipelineFlow({
  nodes,
  gates,
  contractColumns,
}: {
  nodes: Record<string, FlowNode>;
  gates: FlowGate[];
  /** column count from the clean contract, when the spec has loaded */
  contractColumns?: number | null;
}) {
  const gateByState = new Map(gates.map((gate) => [gate.state, gate]));

  return (
    <div className="scroll-shell overflow-x-auto">
      <svg
        viewBox="0 0 1440 470"
        role="img"
        preserveAspectRatio="xMidYMid meet"
        aria-label="Sơ đồ pipeline: Crossref API, crawl và clean chạy một lần, sau đó ba nhánh baseline, corrupted, repaired cùng đi qua index và evaluate, mỗi nhánh có một quality gate, rồi hội tụ ở compare."
        style={{ width: "100%", minWidth: 1040, height: "auto", display: "block" }}
      >
        <defs>
          <marker
            id="flow-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-ink-faint)" />
          </marker>
        </defs>

        {/* source -> crawl -> clean, shared by every lane */}
        <g>
          <rect
            x={SOURCE.x}
            y={178}
            width={SOURCE.w}
            height={64}
            rx={32}
            fill="var(--color-canvas)"
            stroke="var(--color-line)"
            strokeWidth={2}
          />
          <text
            x={SOURCE.x + SOURCE.w / 2}
            y={205}
            textAnchor="middle"
            fontSize={19}
            fontWeight={650}
            fill="var(--color-ink)"
          >
            Crossref
          </text>
          <text
            x={SOURCE.x + SOURCE.w / 2}
            y={226}
            textAnchor="middle"
            fontSize={14}
            fill="var(--color-ink-soft)"
          >
            REST API
          </text>
        </g>
        <Arrow x1={SOURCE.x + SOURCE.w} y1={210} x2={CRAWL.x} y2={210} />
        <Box
          x={CRAWL.x}
          y={172}
          w={CRAWL.w}
          h={BOX_H}
          title="crawl"
          sub="raw response"
          node={nodes.crawl}
          accent="var(--color-brand-blue)"
        />
        <Arrow x1={CRAWL.x + CRAWL.w} y1={210} x2={CLEAN.x} y2={210} />
        <Box
          x={CLEAN.x}
          y={172}
          w={CLEAN.w}
          h={BOX_H}
          title="clean"
          sub={
            typeof contractColumns === "number"
              ? `contract ${contractColumns} cột`
              : "contract cột cố định"
          }
          node={nodes.clean}
          accent="var(--color-brand-blue)"
        />

        {LANES.map((lane, laneIndex) => {
          const gate = gateByState.get(lane.state);
          const boxY = lane.y - BOX_H / 2;
          // three distinct landing points so the arrowheads never stack
          const compareY = COMPARE.y + COMPARE.h / 2 + (laneIndex - 1) * 26;
          return (
            <g key={lane.state}>
              {/* fan-out from clean */}
              <path
                d={`M ${CLEAN.x + CLEAN.w} 210 C ${CLEAN.x + CLEAN.w + 35} 210 ${COL_ACTION.x - 35} ${lane.y} ${COL_ACTION.x} ${lane.y}`}
                fill="none"
                stroke="var(--color-ink-faint)"
                strokeWidth={2}
                markerEnd="url(#flow-arrow)"
              />

              <Box
                x={COL_ACTION.x}
                y={boxY}
                w={COL_ACTION.w}
                h={BOX_H}
                title={lane.action}
                sub={lane.actionSub}
                node={lane.actionKey ? nodes[lane.actionKey] : undefined}
                accent={lane.fill}
                bg={lane.soft}
              />

              {/* quality gate hanging off the dataset */}
              <GateChip
                x={COL_ACTION.x}
                y={lane.y + 44}
                w={COL_ACTION.w}
                gate={gate}
                state={lane.state}
              />

              <Arrow
                x1={COL_ACTION.x + COL_ACTION.w}
                y1={lane.y}
                x2={COL_INDEX.x}
                y2={lane.y}
              />
              <Box
                x={COL_INDEX.x}
                y={boxY}
                w={COL_INDEX.w}
                h={BOX_H}
                title="index"
                sub="MiniLM → Chroma"
                node={nodes[lane.indexKey]}
                accent={lane.fill}
              />
              <Arrow
                x1={COL_INDEX.x + COL_INDEX.w}
                y1={lane.y}
                x2={COL_EVAL.x}
                y2={lane.y}
              />
              <Box
                x={COL_EVAL.x}
                y={boxY}
                w={COL_EVAL.w}
                h={BOX_H}
                title="evaluate"
                sub="cùng 1 test set"
                node={nodes[lane.evalKey]}
                accent={lane.fill}
              />

              {/* converge into compare */}
              <path
                d={`M ${COL_EVAL.x + COL_EVAL.w} ${lane.y} C ${COL_EVAL.x + COL_EVAL.w + 30} ${lane.y} ${COMPARE.x - 30} ${compareY} ${COMPARE.x} ${compareY}`}
                fill="none"
                stroke={lane.fill}
                strokeWidth={2.5}
                markerEnd="url(#flow-arrow)"
              />
            </g>
          );
        })}

        {/* compare */}
        <rect
          x={COMPARE.x}
          y={COMPARE.y}
          width={COMPARE.w}
          height={COMPARE.h}
          rx={14}
          fill="var(--color-brand-blue-50)"
          stroke="var(--color-brand-blue)"
          strokeWidth={2.5}
        />
        <text
          x={COMPARE.x + COMPARE.w / 2}
          y={COMPARE.y + COMPARE.h / 2 - 16}
          textAnchor="middle"
          fontSize={26}
          fontWeight={700}
          fill="var(--color-brand-blue)"
        >
          compare
        </text>
        <text
          x={COMPARE.x + COMPARE.w / 2}
          y={COMPARE.y + COMPARE.h / 2 + 14}
          textAnchor="middle"
          fontSize={17}
          fill="var(--color-ink-soft)"
        >
          3 lần chạy, 1 test set
        </text>
        <NodeCount
          x={COMPARE.x + COMPARE.w / 2}
          y={COMPARE.y + COMPARE.h / 2 + 44}
          node={nodes.compare}
          anchor="middle"
        />
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Box({
  x,
  y,
  w,
  h,
  title,
  sub,
  node,
  accent,
  bg = "var(--color-surface)",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  node?: FlowNode;
  accent: string;
  bg?: string;
}) {
  const done = node?.done ?? false;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={12}
        fill={bg}
        stroke={done ? accent : "var(--color-line)"}
        strokeWidth={done ? 2.5 : 2}
        strokeDasharray={node && !done ? "6 5" : undefined}
      />
      <text
        x={x + w / 2}
        y={y + 30}
        textAnchor="middle"
        fontSize={22}
        fontWeight={650}
        fill="var(--color-ink)"
      >
        {title}
      </text>
      <text
        x={x + w / 2}
        y={y + 51}
        textAnchor="middle"
        fontSize={15}
        fill="var(--color-ink-soft)"
      >
        {sub}
      </text>
      {node ? <NodeCount x={x + w / 2} y={y + 68} node={node} anchor="middle" /> : null}
    </g>
  );
}

function NodeCount({
  x,
  y,
  node,
  anchor,
}: {
  x: number;
  y: number;
  node?: FlowNode;
  anchor: "middle" | "start";
}) {
  if (!node) return null;
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={13}
      fontFamily="var(--font-mono)"
      fill={node.done ? "var(--color-ok)" : "var(--color-ink-faint)"}
    >
      {node.present}/{node.total} artifact
    </text>
  );
}

function Arrow({
  x1,
  y1,
  x2,
  y2,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="var(--color-ink-faint)"
      strokeWidth={2}
      markerEnd="url(#flow-arrow)"
    />
  );
}

function GateChip({
  x,
  y,
  w,
  gate,
  state,
}: {
  x: number;
  y: number;
  w: number;
  gate?: FlowGate;
  state: string;
}) {
  const passed = gate?.passed ?? null;
  const fill =
    passed === true
      ? "var(--color-ok-50)"
      : passed === false
        ? "var(--color-brand-red-50)"
        : "var(--color-canvas)";
  const stroke =
    passed === true
      ? "var(--color-ok-200)"
      : passed === false
        ? "var(--color-brand-red-200)"
        : "var(--color-line)";
  const ink =
    passed === true
      ? "var(--color-ok)"
      : passed === false
        ? "var(--color-brand-red-700)"
        : "var(--color-ink-faint)";
  return (
    <g>
      <line
        x1={x + w / 2}
        y1={y - 6}
        x2={x + w / 2}
        y2={y}
        stroke="var(--color-line)"
        strokeWidth={2}
      />
      <rect
        x={x}
        y={y}
        width={w}
        height={34}
        rx={17}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
      <text
        x={x + w / 2}
        y={y + 23}
        textAnchor="middle"
        fontSize={15}
        fontWeight={650}
        fill={ink}
      >
        {gate ? `observe · quality ${gate.status ?? "?"}` : `observe · ${state}: —`}
      </text>
    </g>
  );
}
