"use client";

import {
  AreaChart, Area, ResponsiveContainer, ReferenceLine,
  XAxis, YAxis, Tooltip,
} from 'recharts';
import { useCurrency } from '../contexts/CurrencyContext';

interface PortfolioChartProps {
  color?: string;
  showReferenceLine?: boolean;
  data?: { time: string; value: number }[];
  /** Called with the hovered price + label, or null/null on mouse-leave */
  onHover?: (value: number | null, time: string | null) => void;
}

export function PortfolioChart({
  color = '#00c805',
  showReferenceLine = false,
  data: propData,
  onHover,
}: PortfolioChartProps) {
  const { formatPrice } = useCurrency();
  const chartData   = propData ?? [];
  const startValue  = chartData[0]?.value ?? 0;
  const gradientId  = `cg-${color.replace(/[^a-z0-9]/gi, '')}`;

  // Domain with a little breathing room so the line isn't clipped at edges
  const values      = chartData.map(d => d.value);
  const minVal      = values.length ? Math.min(...values) : 0;
  const maxVal      = values.length ? Math.max(...values) : 0;
  const pad         = (maxVal - minVal) * 0.1 || 1;
  const domain: [number, number] = [minVal - pad, maxVal + pad];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.value as number;
    const abs = point - startValue;
    const pct = startValue > 0 ? (abs / startValue) * 100 : 0;
    const isUp = abs >= 0;

    return (
      <div className="rounded-lg border border-default surface-3 px-3 py-2 shadow-xl">
        <p className="text-[10px] text-muted">{String(label)}</p>
        <p className="text-xs font-bold app-fg">
          {formatPrice(point)}
        </p>
        <p className={`text-[10px] font-semibold ${isUp ? 'text-[#00c805]' : 'text-[#ff5000]'}`}>
          {isUp ? '+' : ''}{formatPrice(abs)} ({isUp ? '+' : ''}{pct.toFixed(2)}%)
        </p>
      </div>
    );
  };

  return (
    <div className="h-[280px] w-full select-none">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
          onMouseMove={(e: any) => {
            if (e?.activePayload?.length) {
              onHover?.(
                e.activePayload[0].value as number,
                e.activePayload[0].payload.time as string,
              );
            }
          }}
          onMouseLeave={() => onHover?.(null, null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0}    />
            </linearGradient>
          </defs>

          {/* Hidden Y axis just for domain control */}
          <YAxis domain={domain} hide />

          <XAxis
            dataKey="time"
            tick={{ fill: '#6B7280', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={60}
          />

          {showReferenceLine && startValue > 0 && (
            <ReferenceLine
              y={startValue}
              stroke="#2d2d2d"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          )}

          <Tooltip
            cursor={{ stroke: '#555', strokeWidth: 1, strokeDasharray: '4 4' }}
            content={<CustomTooltip />}
          />

          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 3, fill: color, stroke: 'transparent' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
