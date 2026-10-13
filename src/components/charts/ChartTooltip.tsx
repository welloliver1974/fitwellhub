import React from "react";
import { chartColors } from "./chart-theme";

export interface ChartTooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
  unit?: string;
  payload?: Record<string, any>;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  label?: string;
  unit?: string;
  formatter?: (value: number, name?: string, item?: ChartTooltipPayloadItem) => [string, string] | string;
  labelFormatter?: (label: string) => string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  unit = "",
  formatter,
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const formattedLabel = labelFormatter ? labelFormatter(label || "") : label;

  return (
    <div
      className="rounded-2xl px-3.5 py-2.5 shadow-2xl backdrop-blur-md transition-all duration-150 animate-in fade-in zoom-in-95 pointer-events-none"
      style={{
        backgroundColor: chartColors.cardBg,
        border: `1px solid ${chartColors.cardBorder}`,
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(45, 212, 168, 0.15)",
        minWidth: "120px",
      }}
    >
      {formattedLabel && (
        <div className="text-[11px] font-semibold text-muted-foreground pb-1.5 mb-1.5 border-b border-white/10 flex items-center justify-between gap-2">
          <span>{formattedLabel}</span>
        </div>
      )}
      <div className="space-y-1.5">
        {payload.map((item, index) => {
          const itemColor = item.color || chartColors.primary;
          const rawValue = item.value;
          const numValue = typeof rawValue === "number" ? rawValue : Number(rawValue);

          let displayValue: string;
          let displayName = item.name || item.dataKey || "Valor";

          if (formatter && !isNaN(numValue)) {
            const formatted = formatter(numValue, item.name, item);
            if (Array.isArray(formatted)) {
              displayValue = formatted[0];
              displayName = formatted[1];
            } else {
              displayValue = formatted;
            }
          } else if (!isNaN(numValue)) {
            displayValue = `${numValue % 1 === 0 ? numValue : numValue.toFixed(1)}${unit ? ` ${unit}` : ""}`;
          } else {
            displayValue = String(rawValue ?? "-");
          }

          return (
            <div key={`tooltip-item-${index}`} className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                  style={{
                    backgroundColor: itemColor,
                    boxShadow: `0 0 6px ${itemColor}`,
                  }}
                />
                <span className="text-white/80 font-medium text-[11px] truncate max-w-[110px]">
                  {displayName}
                </span>
              </div>
              <span className="font-bold text-white tracking-tight text-[12px]">
                {displayValue}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
