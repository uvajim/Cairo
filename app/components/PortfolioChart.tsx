import {
  AreaChart, Area, ResponsiveContainer, ReferenceLine,
  XAxis, YAxis, Tooltip,
} from 'recharts';

const fallbackData = [
  { time: '9:30',  value: 100 },
  { time: '10:00', value: 98  },
  { time: '10:30', value: 97  },
  { time: '11:00', value: 99  },
  { time: '11:30', value: 101 },
  { time: '12:00', value: 100 },
  { time: '12:30', value: 102 },
  { time: '13:00', value: 101 },
  { time: '13:30', value: 103 },
  { time: '14:00', value: 102 },
  { time: '14:30', value: 104 },
  { time: '15:00', value: 103 },
  { time: '15:30', value: 105 },
];

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
  const chartData   = propData && propData.length > 0 ? propData : fallbackData;
  const startValue  = chartData[0]?.value ?? 0;
  const gradientId  = `cg-${color.replace(/[^a-z0-9]/gi, '')}`;

  // Domain with a little breathing room so the line isn't clipped at edges
  const values      = chartData.map(d => d.value);
  const minVal      = Math.min(...values);
  const maxVal      = Math.max(...values);
  const pad         = (maxVal - minVal) * 0.1 || 1;
  const domain: [number, number] = [minVal - pad, maxVal + pad];

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

          {/* Invisible tooltip — price displayed in parent header, not a bubble */}
          <Tooltip
            cursor={{ stroke: '#555', strokeWidth: 1, strokeDasharray: '4 4' }}
            content={() => null}
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
