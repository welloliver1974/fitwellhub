import React, { useId } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { chartColors, chartDefaults } from "./chart-theme";
import { ChartTooltip } from "./ChartTooltip";

export interface AreaTrendChartProps {
  data: Array<Record<string, unknown>>;
  dataKey: string;
  xAxisKey?: string;
  unit?: string;
  name?: string;
  color?: string;
  height?: number;
  targetValue?: number;
  targetLabel?: string;
  yDomain?: [number | "auto" | "dataMin", number | "auto" | "dataMax"];
  formatter?: (value: number) => [string, string] | string;
  labelFormatter?: (label: string) => string;
}

export function AreaTrendChart({
  data,
  dataKey,
  xAxisKey = "date",
  unit = "",
  name = "Valor",
  color = chartColors.primary,
  height = 200,
  targetValue,
  targetLabel = "Meta",
  yDomain,
  formatter,
  labelFormatter,
}: AreaTrendChartProps) {
  const generatedId = useId().replace(/:/g, "_");
  const gradientId = `trend_grad_${generatedId}`;

  // Custom dot rendering: dá destaque especial ao último ponto (registro mais recente)
  const renderCustomDot = (props: { cx?: number; cy?: number; index?: number }) => {
    const { cx, cy, index } = props;
    const isLast = index === data.length - 1;

    if (!cx || !cy) return null;

    if (isLast) {
      return (
        <g key={`dot-last-${index}`}>
          {/* Halo externo com brilho */}
          <circle cx={cx} cy={cy} r={7} fill={color} fillOpacity={0.25} />
          {/* Círculo com borda */}
          <circle cx={cx} cy={cy} r={4.5} fill="#181b1c" stroke={color} strokeWidth={2.5} />
        </g>
      );
    }

    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={2.5}
        fill={color}
        fillOpacity={0.8}
        stroke="#181b1c"
        strokeWidth={1}
      />
    );
  };

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{
            top: 10,
            right: 8,
            left: -12,
            bottom: 0,
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.32} />
              <stop offset="95%" stopColor={color} stopOpacity={0.0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />

          <XAxis
            dataKey={xAxisKey}
            tickLine={false}
            axisLine={false}
            tick={chartDefaults.axisStyle}
            dy={6}
          />

          <YAxis
            domain={yDomain || ["auto", "auto"]}
            tickLine={false}
            axisLine={false}
            tick={chartDefaults.axisStyle}
            width={38}
            dx={-2}
          />

          <Tooltip
            content={
              <ChartTooltip
                unit={unit}
                formatter={
                  formatter ||
                  ((val: number) => [
                    `${val % 1 === 0 ? val : val.toFixed(1)}${unit ? ` ${unit}` : ""}`,
                    name,
                  ])
                }
                labelFormatter={labelFormatter}
              />
            }
          />

          {targetValue !== undefined && !isNaN(targetValue) && (
            <ReferenceLine
              y={targetValue}
              stroke={chartColors.primaryLight}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `${targetLabel}: ${targetValue}${unit ? ` ${unit}` : ""}`,
                fill: chartColors.primaryLight,
                fontSize: 10,
                position: "insideTopRight",
              }}
            />
          )}

          <Area
            type="monotone"
            dataKey={dataKey}
            name={name}
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
            dot={renderCustomDot}
            activeDot={{
              r: 6,
              fill: color,
              stroke: "#ffffff",
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
