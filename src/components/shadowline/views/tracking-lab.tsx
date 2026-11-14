"use client";

/**
 * Tracking Laboratory — the flagship interactive module.
 *
 * Every trajectory, speed, heading, separation and computed value comes from
 * artifacts/v1/demo/synthetic_drill.json (fetched via /api/demo). The fixture
 * is synthetic and says so: the amber banner is persistent, per the data
 * honesty rules. Plants are derived in-app from the artifact's speed array
 * (speed[i] < 1.5 yd/s) exactly as specified; the generator's ground truth is
 * shown separately, also from the artifact.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Play,
  Pause,
  RotateCcw,
  TriangleAlert,
  Sigma,
  Gauge,
  Flag,
  Info,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDemo, useExperiment } from "@/hooks/use-shadowline";
import type { DemoComputedComponents, DemoSensitivityEntry } from "@/lib/artifacts";
import { QueryError } from "@/components/shadowline/query-error";
import { ModuleSkeleton } from "@/components/shadowline/skeletons";
import {
  CardFrame,
  DataChip,
  MethodologyNote,
  MonoValue,
  SectionHeader,
  StatCard,
} from "@/components/shadowline/primitives";
import { cn } from "@/lib/utils";

/** Product spec: a frame with speed below this value is a plant. */
const PLANT_SPEED_YD_S = 1.5;

const COLORS = {
  emerald: "#34d399",
  emeraldDim: "#0e9f6e",
  amber: "#f59e0b",
  amberSoft: "#fbbf24",
  red: "#dc2626",
  zinc: "#71717a",
} as const;

type Speed = "0.5" | "1" | "2";

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------
function usePlayback(frameCount: number, dt: number) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>("1");

  useEffect(() => {
    if (!playing || frameCount === 0) return;
    const ms = Math.max(16, Math.round((dt * 1000) / Number(speed)));
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % frameCount);
    }, ms);
    return () => window.clearInterval(id);
  }, [playing, speed, dt, frameCount]);

  return { frame, setFrame, playing, setPlaying, speed, setSpeed };
}

function PlaybackBar({
  frameCount,
  dt,
  frame,
  setFrame,
  playing,
  setPlaying,
  speed,
  setSpeed,
}: {
  frameCount: number;
  dt: number;
  frame: number;
  setFrame: (f: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  speed: Speed;
  setSpeed: (s: Speed) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-[#131a16] p-3">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setPlaying(!playing)}
        aria-label={playing ? "Pause animation" : "Play animation"}
        className="size-11 shrink-0 border-zinc-700 bg-[#101613] text-emerald-400 hover:bg-zinc-800 hover:text-emerald-300"
      >
        {playing ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setFrame(0)}
        aria-label="Restart animation"
        className="size-11 shrink-0 border-zinc-700 bg-[#101613] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      >
        <RotateCcw className="size-4" aria-hidden="true" />
      </Button>
      <div className="min-w-36 flex-1">
        <Slider
          value={[frame]}
          min={0}
          max={Math.max(0, frameCount - 1)}
          step={1}
          onValueChange={(values) => setFrame(values[0] ?? 0)}
          aria-label="Frame scrubber"
          className="[&_[data-slot=slider-track]]:bg-zinc-800 [&_[data-slot=slider-range]]:bg-emerald-600 [&_[data-slot=slider-thumb]]:border-emerald-500 [&_[data-slot=slider-thumb]]:bg-[#0E1411]"
        />
      </div>
      <Select value={speed} onValueChange={(v) => setSpeed(v as Speed)}>
        <SelectTrigger
          aria-label="Playback speed"
          className="h-11 w-[5.5rem] border-zinc-700 bg-[#101613] text-zinc-300"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-zinc-800 bg-[#101613] text-zinc-100">
          <SelectItem value="0.5">0.5×</SelectItem>
          <SelectItem value="1">1×</SelectItem>
          <SelectItem value="2">2×</SelectItem>
        </SelectContent>
      </Select>
      <p className="ml-auto font-mono text-xs whitespace-nowrap text-zinc-400">
        t = {(frame * dt).toFixed(1)}s · frame {frame}/{Math.max(0, frameCount - 1)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG canvas (field-style grid)
// ---------------------------------------------------------------------------
interface TrajectorySpec {
  xs: number[];
  ys: number[];
  color: string;
  label: string;
}

interface CanvasMarker {
  x: number;
  y: number;
  label: string;
  color: "amber" | "emerald";
}

function FieldCanvas({
  xMax,
  yMax,
  trajectories,
  markers = [],
  frame,
  ariaLabel,
}: {
  xMax: number;
  yMax: number;
  trajectories: TrajectorySpec[];
  markers?: CanvasMarker[];
  frame: number;
  ariaLabel: string;
}) {
  const unit = 12;
  const pad = 12;
  const width = pad * 2 + xMax * unit;
  const height = pad * 2 + yMax * unit;
  const toPx = (x: number, y: number) => ({
    px: pad + x * unit,
    py: pad + (yMax - y) * unit,
  });
  const toPath = (xs: number[], ys: number[]) =>
    xs
      .map((x, i) => {
        const { px, py } = toPx(x, ys[i]);
        return `${px.toFixed(2)},${py.toFixed(2)}`;
      })
      .join(" ");

  const gridLines: React.ReactNode[] = [];
  for (let i = 0; i <= xMax; i++) {
    const { px } = toPx(i, 0);
    gridLines.push(
      <line
        key={`x${i}`}
        x1={px}
        y1={pad}
        x2={px}
        y2={height - pad}
        stroke={i % 5 === 0 ? "#27332c" : "#1c2420"}
        strokeWidth={i % 5 === 0 ? 0.8 : 0.5}
      />
    );
  }
  for (let j = 0; j <= yMax; j++) {
    const { py } = toPx(0, j);
    gridLines.push(
      <line
        key={`y${j}`}
        x1={pad}
        y1={py}
        x2={width - pad}
        y2={py}
        stroke={j % 5 === 0 ? "#27332c" : "#1c2420"}
        strokeWidth={j % 5 === 0 ? 0.8 : 0.5}
      />
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full rounded-lg border border-zinc-800 bg-[#0D1310]"
      role="img"
      aria-label={ariaLabel}
    >
      {gridLines}
      <rect
        x={pad}
        y={pad}
        width={width - pad * 2}
        height={height - pad * 2}
        fill="none"
        stroke="#2a2f2c"
        strokeWidth={1}
        rx={2}
      />
      {trajectories.map((traj) => (
        <g key={traj.label}>
          <polyline
            points={toPath(traj.xs, traj.ys)}
            fill="none"
            stroke={traj.color}
            strokeWidth={1.4}
            opacity={0.28}
          />
          <polyline
            points={toPath(traj.xs.slice(0, frame + 1), traj.ys.slice(0, frame + 1))}
            fill="none"
            stroke={traj.color}
            strokeWidth={2}
          />
          {(() => {
            const { px, py } = toPx(traj.xs[frame], traj.ys[frame]);
            return (
              <circle cx={px} cy={py} r={3.4} fill={traj.color} stroke="#0A0E0C" strokeWidth={0.9} />
            );
          })()}
        </g>
      ))}
      {markers.map((m) => {
        const { px, py } = toPx(m.x, m.y);
        const color = m.color === "amber" ? COLORS.amber : COLORS.emerald;
        return (
          <g key={`${m.label}-${m.x.toFixed(2)}-${m.y.toFixed(2)}`}>
            <polygon
              points={`${px},${py - 4} ${px + 4},${py} ${px},${py + 4} ${px - 4},${py}`}
              fill={color}
              opacity={0.9}
            />
            <text
              x={px}
              y={py - 6.5}
              textAnchor="middle"
              fontSize={3.1}
              fill={m.color === "amber" ? COLORS.amberSoft : "#a7f3d0"}
              className="font-mono"
            >
              {m.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Time-series chart
// ---------------------------------------------------------------------------
interface ChartMarkerSpec {
  index: number;
  label: string;
  color: string;
}
interface HLineSpec {
  y: number;
  label: string;
  color: string;
}

function TimeSeriesChart({
  t,
  series,
  markers = [],
  hLines = [],
  yLabel,
  xLabel,
  ariaLabel,
}: {
  t: number[];
  series: Array<{ values: number[]; color: string; label: string }>;
  markers?: ChartMarkerSpec[];
  hLines?: HLineSpec[];
  yLabel: string;
  xLabel: string;
  ariaLabel: string;
}) {
  const W = 600;
  const H = 240;
  const left = 48;
  const right = 16;
  const top = 24;
  const bottom = 34;

  const allValues = series.flatMap((s) => s.values).concat(hLines.map((h) => h.y));
  const rawMax = Math.max(...allValues);
  const rawMin = Math.min(...allValues, 0);
  const yMax = rawMax === rawMin ? rawMax + 1 : rawMax + (rawMax - rawMin) * 0.08;
  const yMin = rawMin;
  const tMax = t[t.length - 1] ?? 1;
  const x = (time: number) => left + (time / (tMax || 1)) * (W - left - right);
  const y = (v: number) => H - bottom - ((v - yMin) / (yMax - yMin || 1)) * (H - top - bottom);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * (yMax - yMin));
  const xTicks = [0, tMax / 2, tMax];

  return (
    <figure className="min-w-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full rounded-lg border border-zinc-800 bg-[#0D1310]"
        role="img"
        aria-label={ariaLabel}
      >
        {yTicks.map((tick, i) => (
          <g key={`ytick-${i}`}>
            <line
              x1={left}
              y1={y(tick)}
              x2={W - right}
              y2={y(tick)}
              stroke="#232a26"
              strokeWidth={0.7}
            />
            <text
              x={left - 6}
              y={y(tick) + 3}
              textAnchor="end"
              fontSize={9}
              fill="#5b6167"
              className="font-mono"
            >
              {tick >= 100 ? tick.toFixed(0) : tick.toFixed(1)}
            </text>
          </g>
        ))}
        {xTicks.map((tick, i) => (
          <g key={`xtick-${i}`}>
            <line
              x1={x(tick)}
              y1={top - 6}
              x2={x(tick)}
              y2={H - bottom}
              stroke="#232a26"
              strokeWidth={0.7}
            />
            <text
              x={x(tick)}
              y={H - bottom + 16}
              textAnchor="middle"
              fontSize={9}
              fill="#5b6167"
              className="font-mono"
            >
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        {hLines.map((h) => (
          <g key={`hline-${h.label}`}>
            <line
              x1={left}
              y1={y(h.y)}
              x2={W - right}
              y2={y(h.y)}
              stroke={h.color}
              strokeWidth={1}
              strokeDasharray="5 4"
              opacity={0.8}
            />
            <text
              x={W - right - 2}
              y={y(h.y) - 5}
              textAnchor="end"
              fontSize={9}
              fill={h.color}
              className="font-mono"
            >
              {h.label}
            </text>
          </g>
        ))}
        {markers.map((m, i) => {
          const mx = x(t[m.index] ?? 0);
          const chipY = i % 2 === 0 ? 10 : 20;
          return (
            <g key={`marker-${m.label}-${m.index}`}>
              <line
                x1={mx}
                y1={top - 4}
                x2={mx}
                y2={H - bottom}
                stroke={m.color}
                strokeWidth={1}
                strokeDasharray="4 3"
                opacity={0.75}
              />
              <text
                x={mx}
                y={chipY + 4}
                textAnchor="middle"
                fontSize={8.5}
                fill={m.color}
                className="font-mono"
              >
                {m.label}
              </text>
            </g>
          );
        })}
        {series.map((s) => (
          <polyline
            key={s.label}
            points={s.values
              .map((v, i) => `${x(t[i] ?? 0).toFixed(1)},${y(v).toFixed(1)}`)
              .join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={1.8}
          />
        ))}
        <text
          x={left}
          y={H - 6}
          fontSize={8.5}
          fill="#5b6167"
          className="font-mono"
        >
          {xLabel}
        </text>
        <text
          x={6}
          y={top - 8}
          fontSize={8.5}
          fill="#5b6167"
          className="font-mono"
        >
          {yLabel}
        </text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={`legend-${s.label}`} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
            <span
              className="inline-block h-0.5 w-4 rounded"
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            {s.label}
          </span>
        ))}
        <span className="ml-auto font-mono text-[10px] text-zinc-600">
          {series[0]?.values.length ?? 0} frames · dt {(t[1] ?? 0).toFixed(2)}s
        </span>
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Drill tab
// ---------------------------------------------------------------------------
const COMPONENT_UNITS: Record<string, string> = {
  reorientation_latency: "s",
  turn_speed_retention: "ratio",
  directional_transition_efficiency: "ratio",
  exit_acceleration: "yd/s²",
  attempt_time_s: "s",
  mean_speed_yd_s: "yd/s",
  peak_speed_yd_s: "yd/s",
  path_length_yd: "yd",
};

const CONTEXT_KEYS = [
  "attempt_time_s",
  "n_reversals",
  "mean_speed_yd_s",
  "peak_speed_yd_s",
  "path_length_yd",
] as const;

const MRI_KEYS = [
  "reorientation_latency",
  "turn_speed_retention",
  "directional_transition_efficiency",
  "exit_acceleration",
] as const;

function ComponentRow({ name, value, unit }: { name: string; value: number | null; unit: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-md border border-zinc-800 bg-[#131a16] px-3 py-2">
      <span className="font-mono text-[11px] text-zinc-500">{name}</span>
      <span className="flex items-baseline gap-1.5">
        <MonoValue className="text-sm text-zinc-100">
          {value === null ? "null" : String(value)}
        </MonoValue>
        <span className="text-[10px] text-zinc-600">{unit}</span>
      </span>
    </div>
  );
}

function DrillTab({
  xs,
  ys,
  t,
  speed,
  heading,
  dt,
  computed,
  sensitivity,
  groundTruth,
  description,
}: {
  xs: number[];
  ys: number[];
  t: number[];
  speed: number[];
  heading: number[];
  dt: number;
  computed: DemoComputedComponents;
  sensitivity: Record<string, DemoSensitivityEntry>;
  groundTruth: { exit_speed: number; n_reversals: number; plant_indices: number[]; plant_speed: number };
  description: string;
}) {
  const n = xs.length;
  const { frame, setFrame, playing, setPlaying, speed: playSpeed, setSpeed } = usePlayback(n, dt);

  const plants = useMemo(
    () => speed.flatMap((s, i) => (s < PLANT_SPEED_YD_S ? [i] : [])),
    [speed]
  );

  const canvasMarkers = plants.map((i) => ({
    x: xs[i],
    y: ys[i],
    label: "PLANT",
    color: "amber" as const,
  }));

  const chartMarkers = plants.map((i) => ({
    index: i,
    label: "PLANT",
    color: COLORS.amber,
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <CardFrame
            title="Drill field — synthetic shuttle"
            icon={Activity}
            right={
              <DataChip tone="amber">{n} frames · dt {dt}s</DataChip>
            }
            footer={
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                <span className="inline-flex items-center gap-1.5 text-zinc-400">
                  <span className="inline-block h-0.5 w-4 rounded bg-emerald-400" aria-hidden="true" />
                  trajectory (bright = travelled)
                </span>
                <span className="inline-flex items-center gap-1.5 text-zinc-400">
                  <span className="inline-block size-2 rotate-45 bg-amber-400" aria-hidden="true" />
                  plant (speed &lt; {PLANT_SPEED_YD_S} yd/s)
                </span>
              </span>
            }
          >
            <FieldCanvas
              xMax={10}
              yMax={10}
              frame={frame}
              trajectories={[{ xs, ys, color: COLORS.emerald, label: "athlete" }]}
              markers={canvasMarkers}
              ariaLabel="Synthetic combine drill trajectory on a gridded field canvas, animated by frame"
            />
            <PlaybackBar
              frameCount={n}
              dt={dt}
              frame={frame}
              setFrame={setFrame}
              playing={playing}
              setPlaying={setPlaying}
              speed={playSpeed}
              setSpeed={setSpeed}
            />
          </CardFrame>

          <div className="grid gap-4 md:grid-cols-2">
            <CardFrame
              title="Speed vs time"
              icon={Gauge}
              footer={
                <MethodologyNote>
                  Plant markers derived in-app from the artifact speed array:
                  frame i is a plant when speed[i] &lt; {PLANT_SPEED_YD_S} yd/s.
                  Frame 0 is the standing start, included by the rule.
                </MethodologyNote>
              }
            >
              <TimeSeriesChart
                t={t}
                series={[{ values: speed, color: COLORS.emerald, label: "speed (yd/s)" }]}
                markers={chartMarkers}
                yLabel="yd/s"
                xLabel="t (s)"
                ariaLabel="Speed versus time chart with plant markers"
              />
            </CardFrame>
            <CardFrame title="Heading vs time" icon={Activity}>
              <TimeSeriesChart
                t={t}
                series={[{ values: heading, color: COLORS.zinc, label: "heading (deg)" }]}
                yLabel="deg"
                xLabel="t (s)"
                ariaLabel="Heading versus time chart"
              />
            </CardFrame>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <CardFrame title="Computed MRI components (this attempt)" icon={Sigma}>
            <div className="space-y-2">
              {MRI_KEYS.map((key) => (
                <ComponentRow
                  key={key}
                  name={key}
                  value={computed[key] ?? null}
                  unit={COMPONENT_UNITS[key] ?? ""}
                />
              ))}
            </div>
            <p className="mt-4 text-[10px] font-semibold tracking-widest text-zinc-600 uppercase">
              Attempt context
            </p>
            <div className="mt-2 space-y-2">
              {CONTEXT_KEYS.map((key) => (
                <ComponentRow
                  key={key}
                  name={key}
                  value={computed[key] ?? null}
                  unit={key === "n_reversals" ? "count" : COMPONENT_UNITS[key] ?? ""}
                />
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 text-[11px] text-zinc-500">
              quality_flags:
              {computed.quality_flags.length > 0 ? (
                <DataChip tone="amber">{computed.quality_flags.join(", ")}</DataChip>
              ) : (
                <DataChip tone="emerald">none</DataChip>
              )}
            </p>
          </CardFrame>

          <CardFrame title="Generator ground truth (synthetic)" icon={Flag}>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">plant_indices</p>
                <p className="mt-1 font-mono text-sm text-emerald-300">
                  [{groundTruth.plant_indices.join(", ")}]
                </p>
              </div>
              <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">n_reversals</p>
                <p className="mt-1 font-mono text-sm text-zinc-200">{groundTruth.n_reversals}</p>
              </div>
              <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">plant_speed</p>
                <p className="mt-1 font-mono text-sm text-zinc-200">
                  {groundTruth.plant_speed} <span className="text-[10px] text-zinc-600">yd/s</span>
                </p>
              </div>
              <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">exit_speed</p>
                <p className="mt-1 font-mono text-sm text-zinc-200">
                  {groundTruth.exit_speed} <span className="text-[10px] text-zinc-600">yd/s</span>
                </p>
              </div>
            </div>
            <MethodologyNote className="mt-3">
              Known by construction (fixed random seed) — used to validate the
              algorithms, never as evidence.
            </MethodologyNote>
          </CardFrame>

          <CardFrame title="Parameter sensitivity" icon={Sigma}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-[10px] tracking-widest text-zinc-500 uppercase">
                    <th scope="col" className="py-2 pr-3 font-semibold">Component</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">min</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">median</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">max</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">rel. spread</th>
                    <th scope="col" className="py-2 font-semibold">combos</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(sensitivity).map(([name, entry]) => (
                    <tr key={name} className="border-b border-zinc-800/60 last:border-0">
                      <td className="py-2.5 pr-3">
                        <MonoValue className="text-zinc-300">{name}</MonoValue>
                      </td>
                      <td className="py-2.5 pr-3"><MonoValue className="text-zinc-400">{entry.min}</MonoValue></td>
                      <td className="py-2.5 pr-3"><MonoValue className="text-zinc-100">{entry.median}</MonoValue></td>
                      <td className="py-2.5 pr-3"><MonoValue className="text-zinc-400">{entry.max}</MonoValue></td>
                      <td className="py-2.5 pr-3"><MonoValue className="text-amber-400">{entry.max_relative_spread}</MonoValue></td>
                      <td className="py-2.5"><MonoValue className="text-zinc-500">{entry.n_parameter_combinations}</MonoValue></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <MethodologyNote className="mt-3">
              Scan over recovery_threshold 0.6/0.7/0.8 on this synthetic
              attempt (n_parameter_combinations = 3), as recorded in the
              artifact.
            </MethodologyNote>
          </CardFrame>
        </div>
      </div>

      <blockquote className="rounded-lg border border-zinc-800 bg-[#0E1411] p-4 text-sm leading-relaxed text-zinc-400 italic">
        {description}
      </blockquote>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coverage tab
// ---------------------------------------------------------------------------
function CoverageTab({
  defender,
  receiver,
  separation,
  t,
  dt,
  breakIndex,
  passForwardIndex,
  groundTruth,
  description,
  openThresholdYd,
}: {
  defender: { x: number[]; y: number[] };
  receiver: { x: number[]; y: number[] };
  separation: number[];
  t: number[];
  dt: number;
  breakIndex: number;
  passForwardIndex: number;
  groundTruth: { defender_reaction_delay_s: number; receiver_break_frame: number; separation_at_pass_forward: number };
  description: string;
  openThresholdYd: number | null;
}) {
  const n = t.length;
  const { frame, setFrame, playing, setPlaying, speed, setSpeed } = usePlayback(n, dt);

  const canvasMarkers = [
    { x: receiver.x[breakIndex], y: receiver.y[breakIndex], label: "BREAK", color: "amber" as const },
    { x: receiver.x[passForwardIndex], y: receiver.y[passForwardIndex], label: "PASS FWD", color: "amber" as const },
  ];

  const chartMarkers = [
    { index: breakIndex, label: "BREAK", color: COLORS.amber },
    { index: passForwardIndex, label: "PASS FWD", color: COLORS.amber },
  ];

  const hLines =
    openThresholdYd !== null
      ? [{ y: openThresholdYd, label: `open ≥ ${openThresholdYd} yd (pre-registered)`, color: COLORS.zinc }]
      : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <CardFrame
            title="Coverage rep — out-break vs off-coverage corner"
            icon={Activity}
            right={<DataChip tone="amber">{n} frames · dt {dt}s</DataChip>}
            footer={
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                <span className="inline-flex items-center gap-1.5 text-zinc-400">
                  <span className="inline-block h-0.5 w-4 rounded bg-emerald-400" aria-hidden="true" />
                  defender (CB)
                </span>
                <span className="inline-flex items-center gap-1.5 text-zinc-400">
                  <span className="inline-block h-0.5 w-4 rounded bg-amber-400" aria-hidden="true" />
                  receiver (WR)
                </span>
                <span className="inline-flex items-center gap-1.5 text-zinc-400">
                  <span className="inline-block size-2 rotate-45 bg-amber-400" aria-hidden="true" />
                  route events
                </span>
              </span>
            }
          >
            <FieldCanvas
              xMax={10}
              yMax={11}
              frame={frame}
              trajectories={[
                { xs: defender.x, ys: defender.y, color: COLORS.emerald, label: "defender" },
                { xs: receiver.x, ys: receiver.y, color: COLORS.amber, label: "receiver" },
              ]}
              markers={canvasMarkers}
              ariaLabel="Synthetic coverage rep: defender and receiver trajectories on a gridded field canvas, animated by frame"
            />
            <PlaybackBar
              frameCount={n}
              dt={dt}
              frame={frame}
              setFrame={setFrame}
              playing={playing}
              setPlaying={setPlaying}
              speed={speed}
              setSpeed={setSpeed}
            />
          </CardFrame>

          <CardFrame
            title="Separation vs time"
            icon={Gauge}
            footer={
              <MethodologyNote>
                Event lines at the artifact-declared break_index ({breakIndex})
                and pass_forward_index ({passForwardIndex}). The open threshold
                line is the pre-registered coverage parameter
                (experiment_register.json), not derived from this fixture.
              </MethodologyNote>
            }
          >
            <TimeSeriesChart
              t={t}
              series={[{ values: separation, color: COLORS.amberSoft, label: "separation (yd)" }]}
              markers={chartMarkers}
              hLines={hLines}
              yLabel="yd"
              xLabel="t (s)"
              ariaLabel="Defender-receiver separation versus time chart with break and pass forward event lines"
            />
          </CardFrame>
        </div>

        <div className="min-w-0 space-y-4">
          <CardFrame title="Route events (artifact-declared)" icon={Flag}>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">break_index</p>
                <p className="mt-1 font-mono text-sm text-amber-300">
                  {breakIndex} <span className="text-[10px] text-zinc-600">frame · t {(t[breakIndex]).toFixed(1)}s</span>
                </p>
              </div>
              <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">pass_forward_index</p>
                <p className="mt-1 font-mono text-sm text-amber-300">
                  {passForwardIndex} <span className="text-[10px] text-zinc-600">frame · t {(t[passForwardIndex]).toFixed(1)}s</span>
                </p>
              </div>
            </div>
            <MethodologyNote className="mt-3">
              Separation at pass forward (artifact):
              <MonoValue className="ml-1 text-zinc-300">
                {groundTruth.separation_at_pass_forward} yd
              </MonoValue>
            </MethodologyNote>
          </CardFrame>

          <CardFrame title="Generator ground truth (synthetic)" icon={Flag}>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">defender reaction delay</p>
                <p className="mt-1 font-mono text-sm text-zinc-200">
                  {groundTruth.defender_reaction_delay_s} <span className="text-[10px] text-zinc-600">s</span>
                </p>
              </div>
              <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">receiver break frame</p>
                <p className="mt-1 font-mono text-sm text-zinc-200">{groundTruth.receiver_break_frame}</p>
              </div>
              <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3 sm:col-span-2">
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">separation at pass forward</p>
                <p className="mt-1 font-mono text-sm text-zinc-200">
                  {groundTruth.separation_at_pass_forward} <span className="text-[10px] text-zinc-600">yd</span>
                </p>
              </div>
            </div>
          </CardFrame>

          <CardFrame title="Algorithm validation, not evidence" icon={Info}>
            <p className="text-sm leading-relaxed text-zinc-400">
              This fixture exists to validate the coverage algorithms (mirror
              latency, separation recovery) against a known reaction delay, and
              to demonstrate the UI. It is never merged into analytical claims.
            </p>
          </CardFrame>
        </div>
      </div>

      <blockquote className="rounded-lg border border-zinc-800 bg-[#0E1411] p-4 text-sm leading-relaxed text-zinc-400 italic">
        {description}
      </blockquote>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------
export default function TrackingLabView() {
  const demo = useDemo();
  const experiment = useExperiment();
  const openThresholdYd = experiment.data?.coverage_parameters.separation_open_yd ?? null;

  if (demo.isError) {
    return (
      <div className="space-y-6">
        <SectionHeader
          icon={Activity}
          title="Tracking Laboratory"
          description="Frame-level trajectory playback over the clearly-labelled synthetic demonstration fixture."
        />
        <QueryError
          error={demo.error}
          onRetry={() => demo.refetch()}
          label="Could not read demo/synthetic_drill.json"
        />
      </div>
    );
  }

  if (demo.isPending) {
    return <ModuleSkeleton />;
  }

  const d = demo.data;
  const drill = d.drill_trajectory;
  const coverage = d.coverage_play;

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Activity}
        title="Tracking Laboratory"
        description="Frame-level trajectory playback, speed/heading/separation charts and the computed MRI components of the demonstration attempt — interactive, and honest about being synthetic."
        right={
          <DataChip tone="amber" className="normal-case">
            generated by {d.generated_by}
          </DataChip>
        }
      />

      <section
        aria-label="synthetic data warning"
        className="flex items-start gap-3 rounded-lg border border-amber-600/70 bg-amber-950/30 p-4"
      >
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold tracking-tight text-amber-200">
            SYNTHETIC DEMONSTRATION FIXTURE — NOT NFL DATA
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
            Both fixtures in this laboratory are synthetic ({d.label}). They
            exist to validate the algorithms and demonstrate the interface.
            Nothing here is ever used as competition evidence.
          </p>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="drill frames" value={String(drill.x.length)} sub={`dt ${drill.dt}s · ${drill.t[drill.t.length - 1].toFixed(1)}s`} />
        <StatCard label="drill reversals (computed)" value={String(d.computed_components.n_reversals ?? "null")} tone="muted" sub="from computed_components" />
        <StatCard label="coverage frames" value={String(coverage.t.length)} sub={`dt ${coverage.dt}s`} />
        <StatCard
          label="separation at pass forward"
          value={String(coverage.ground_truth.separation_at_pass_forward)}
          tone="warning"
          sub="synthetic ground truth (yd)"
        />
      </div>

      <Tabs defaultValue="drill" className="gap-4">
        <TabsList
          aria-label="Laboratory fixtures"
          className="h-11 w-full max-w-xl justify-start gap-1 overflow-x-auto rounded-lg border border-zinc-800 bg-[#131a16] p-1"
        >
          <TabsTrigger
            value="drill"
            className="h-9 rounded-md px-4 text-xs font-semibold text-zinc-400 data-[state=active]:bg-emerald-600/15 data-[state=active]:text-emerald-300"
          >
            Combine drill (synthetic)
          </TabsTrigger>
          <TabsTrigger
            value="coverage"
            className="h-9 rounded-md px-4 text-xs font-semibold text-zinc-400 data-[state=active]:bg-emerald-600/15 data-[state=active]:text-emerald-300"
          >
            Coverage rep (synthetic)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drill" className="mt-0">
          <DrillTab
            xs={drill.x}
            ys={drill.y}
            t={drill.t}
            speed={drill.speed}
            heading={drill.heading}
            dt={drill.dt}
            computed={d.computed_components}
            sensitivity={d.sensitivity}
            groundTruth={drill.ground_truth}
            description={drill.description}
          />
        </TabsContent>

        <TabsContent value="coverage" className="mt-0">
          <CoverageTab
            defender={coverage.defender}
            receiver={coverage.receiver}
            separation={coverage.separation}
            t={coverage.t}
            dt={coverage.dt}
            breakIndex={coverage.break_index}
            passForwardIndex={coverage.pass_forward_index}
            groundTruth={coverage.ground_truth}
            description={coverage.description}
            openThresholdYd={openThresholdYd}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
