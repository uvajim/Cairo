import { Line, LineChart, ResponsiveContainer } from 'recharts';

interface SparklineProps {
  data: number[];
  color?: string;
}

export function Sparkline({ data, color }: SparklineProps) {
  const chartData = data.map((val, i) => ({ i, val }));
  const isPositive = data[data.length - 1] >= data[0];
  const strokeColor = color || (isPositive ? '#00c805' : '#ff5000'); // Robinhood green/orange

  return (
    <div className="h-8 w-16">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="val"
            stroke={strokeColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
