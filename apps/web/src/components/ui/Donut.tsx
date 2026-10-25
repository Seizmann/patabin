import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const palette = ['#1F4D3A', '#2F6B4F', '#4A2C1D', '#B9854A', '#8A6D5C', '#C8B79B'];

export default function Donut({
  title,
  data,
  centerLabel,
  centerValue,
}: {
  title: string;
  data: { name: string; value: number }[];
  centerLabel: string;
  centerValue: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="card p-5">
      <p className="p-label mb-4 text-center">{title}</p>
      <div className="relative h-56" role="img" aria-label={title}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip formatter={(v: number) => data.length ? `${Number(v).toLocaleString('en-IN')}` : ''} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="none">
              {data.map((_, i) => (
                <Cell key={i} fill={palette[i % palette.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="p-label">{centerLabel}</p>
          <p className="p-num text-2xl font-extrabold">{centerValue}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {data.map((d, i) => (
          <span key={d.name} className="p-caption flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ background: palette[i % palette.length] }} />
            {d.name} {total > 0 ? toBn(Math.round((d.value * 100) / total)) : ''}%
          </span>
        ))}
      </div>
    </div>
  );
}

function toBn(v: number): string {
  return String(v).replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)] ?? d);
}
