import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { chartColors, chartDefaults } from "./chart-theme";
import { ChartTooltip } from "./ChartTooltip";

export interface DualMetricChartProps {
  data: Array<Record<string, unknown>>;
  xAxisKey?: string;
  leftKey?: string;
  leftName?: string;
  leftUnit?: string;
  leftColor?: string;
  rightKey?: string;
  rightName?: string;
  rightUnit?: string;
  rightColor?: string;
  height?: number;
  showLegend?: boolean;
}

export function DualMetricChart({
  data,
  xAxisKey = "date",
  leftKey = "fat",
  leftName = "Gordura",
  leftUnit = "%",
  leftColor = chartColors.body.fat,
  rightKey = "muscle",
  rightName = "Músculo",
  rightUnit = "kg",
  rightColor = chartColors.body.muscle,
  height = 240,
  showLegend = true,
}: DualMetricChartProps) {
  // Custom dot dando destaque ao último registro
  const createDotRenderer = (color: string) => {
    return (props: { cx?: number; cy?: number; index?: number }) => {
      const { cx, cy, index } = props;
      const isLast = index === data.length - 1;

      if (!cx || !cy) return null;

      if (isLast) {
        return (
          <g key={`dot-last-${index}-${color}`}>
            <circle cx={cx} cy={cy} r={6.5} fill={color} fillOpacity={0.25} />
            <circle cx={cx} cy={cy} r={4} fill="#181b1c" stroke={color} strokeWidth={2.5} />
          </g>
        );
      }

      return (
        <circle
          key={`dot-${index}-${color}`}
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
  };

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{
            top: 10,
            right: 0,
            left: -14,
            bottom: 0,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />

          <XAxis
            dataKey={xAxisKey}
            tickLine={false}
            axisLine={false}
            tick={chartDefaults.axisStyle}
            dy={6}
          />

          {/* Eixo Y da Esquerda (Ex: Gordura em %) */}
          <YAxis
            yAxisId="left"
            orientation="left"
            domain={["auto", "auto"]}
            tickLine={false}
            axisLine={false}
            tick={{
              ...chartDefaults.axisStyle,
              fill: leftColor,
            }}
            width={36}
            dx={-2}
            unit={leftUnit ? ` ${leftUnit}` : ""}
          />

          {/* Eixo Y da Direita (Ex: Músculo em kg) */}
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={["auto", "auto"]}
            tickLine={false}
            axisLine={false}
            tick={{
              ...chartDefaults.axisStyle,
              fill: rightColor,
            }}
            width={36}
            dx={2}
            unit={rightUnit ? ` ${rightUnit}` : ""}
          />

          <Tooltip
            content={
              <ChartTooltip
                formatter={(val: number, name?: string) => {
                  if (name === leftName) {
                    return [`${val.toFixed(1)}${leftUnit ? ` ${leftUnit}` : ""}`, leftName];
                  }
                  if (name === rightName) {
                    return [`${val.toFixed(1)}${rightUnit ? ` ${rightUnit}` : ""}`, rightName];
                  }
                  return [`${val.toFixed(1)}`, name || "Valor"];
                }}
              />
            }
          />

          {showLegend && (
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{
                paddingBottom: 8,
                fontSize: 11,
                fontWeight: 600,
              }}
            />
          )}

          <Line
            yAxisId="left"
            type="monotone"
            dataKey={leftKey}
            name={leftName}
            stroke={leftColor}
            strokeWidth={2.5}
            dot={createDotRenderer(leftColor)}
            activeDot={{
              r: 6,
              fill: leftColor,
              stroke: "#ffffff",
              strokeWidth: 2,
            }}
          />

          <Line
            yAxisId="right"
            type="monotone"
            dataKey={rightKey}
            name={rightName}
            stroke={rightColor}
            strokeWidth={2.5}
            dot={createDotRenderer(rightColor)}
            activeDot={{
              r: 6,
              fill: rightColor,
              stroke: "#ffffff",
              strokeWidth: 2,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
