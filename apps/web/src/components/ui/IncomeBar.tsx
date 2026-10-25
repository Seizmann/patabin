import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

function toBn(v: number): string {
  return String(v).replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)] ?? d);
}

export default function IncomeBar({ data }: { data: { day: string; income: number }[] }) {
  return (
    <div className="card p-5">
      <p className="p-label mb-4 text-center">দৈনিক আয়</p>
      <div className="h-52" role="img" aria-label="দৈনিক আয়">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.map((d) => ({ ...d, day: toBn(Number(d.day.slice(8))) }))}>
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6B6158' }} axisLine={{ stroke: '#E4DDCF' }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#6B6158' }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => v >= 1000 ? toBn(Math.round(v / 1000)) + 'হাজার' : toBn(v)} />
            <Tooltip formatter={(v: number) => `${Number(v).toLocaleString('en-IN')}`} />
            <Bar dataKey="income" fill="#2F6B4F" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.length === 0 && <p className="p-caption text-center">এই সময়ে কোনো আয় নেই।</p>}
    </div>
  );
}
