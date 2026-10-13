import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { chartColors, chartDefaults } from "./chart-theme";
import { ChartTooltip } from "./ChartTooltip";

export interface NutritionSeriesItem {
  dataKey: string;
  name: string;
  color: string;
  stackId?: string;
  radius?: [number, number, number, number];
}

export interface NutritionBarsChartProps {
  data: Array<Record<string, any>>;
  mode?: "calories" | "macros";
  range?: 7 | 30;
  dataKey?: string;
  series?: NutritionSeriesItem[];
  xAxisKey?: string;
  unit?: string;
  color?: string;
  height?: number;
  targetValue?: number;
  targetLabel?: string;
  showLegend?: boolean;
}

export function NutritionBarsChart({
  data,
  mode,
  range,
  dataKey = "calories",
  series,
  xAxisKey = "label",
  unit,
  color = chartColors.macros.calories,
  height = 220,
  targetValue,
  targetLabel = "Meta",
  showLegend,
}: NutritionBarsChartProps) {
  // Ajuste de densidade do eixo X para não amontoar em 30 dias no mobile
  const isThirtyDays = range === 30 || data.length > 14;
  const xInterval = isThirtyDays ? Math.max(1, Math.ceil(data.length / 6) - 1) : 0;

  // Configuração por modo
  let activeSeries = series;
  let activeUnit = unit;
  let activeShowLegend = showLegend ?? false;
  let activeDataKey = dataKey;
  let activeColor = color;

  if (mode === "calories") {
    activeDataKey = "calories";
    activeUnit = unit || "kcal";
    activeColor = chartColors.macros.calories;
    activeShowLegend = false;
  } else if (mode === "macros") {
    activeUnit = unit || "g";
    activeShowLegend = showLegend ?? true;
    activeSeries = series || [
      {
        dataKey: "protein_g",
        name: "Proteína",
        color: chartColors.macros.protein,
        stackId: "macros",
      },
      {
        dataKey: "carbs_g",
        name: "Carbo",
        color: chartColors.macros.carbs,
        stackId: "macros",
      },
      {
        dataKey: "fat_g",
        name: "Gordura",
        color: chartColors.macros.fat,
        stackId: "macros",
        radius: [4, 4, 0, 0],
      },
    ];
  } else {
    activeUnit = unit || "kcal";
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{
            top: 10,
            right: 8,
            left: -12,
            bottom: 0,
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={chartColors.grid}
            vertical={false}
          />

          <XAxis
            dataKey={xAxisKey}
            tickLine={false}
            axisLine={false}
            tick={chartDefaults.axisStyle}
            interval={xInterval}
            dy={6}
          />

          <YAxis
            tickLine={false}
            axisLine={false}
            tick={chartDefaults.axisStyle}
            width={38}
            dx={-2}
          />

          <Tooltip
            content={
              <ChartTooltip
                unit={activeUnit}
                formatter={(val: number, name?: string) => [
                  `${Math.round(val)}${activeUnit ? ` ${activeUnit}` : ""}`,
                  name || "Valor",
                ]}
              />
            }
          />

          {activeShowLegend && (
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{
                paddingBottom: 8,
                fontSize: 11,
                fontWeight: 600,
                color: chartColors.muted,
              }}
            />
          )}

          {targetValue !== undefined && !isNaN(targetValue) && (
            <ReferenceLine
              y={targetValue}
              stroke={chartColors.primaryLight}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `${targetLabel}: ${targetValue}${activeUnit ? ` ${activeUnit}` : ""}`,
                fill: chartColors.primaryLight,
                fontSize: 10,
                position: "insideTopRight",
              }}
            />
          )}

          {activeSeries && activeSeries.length > 0 ? (
            activeSeries.map((item, idx) => (
              <Bar
                key={item.dataKey}
                dataKey={item.dataKey}
                name={item.name}
                fill={item.color}
                stackId={item.stackId}
                radius={
                  item.radius ||
                  (idx === activeSeries!.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0])
                }
              />
            ))
          ) : (
            <Bar
              dataKey={activeDataKey}
              fill={activeColor}
              radius={[4, 4, 0, 0]}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
