const getWeatherIcon = (code: number) => {
  if (code === 0) return "☀️";
  if (code <= 3) return "🌤️";
  if (code >= 51 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 95) return "⛈️";
  return "☁️";
};

export const WeatherTile = ({
  site,
  onClick,
}: {
  site: any;
  onClick: () => void;
}) => {
  const snapshot = site.weather_snapshots?.data;
  const current = snapshot?.current;
  const daily = snapshot?.daily;

  return (
    <button
      onClick={onClick}
      className="p-5 bg-white rounded-[28px] border border-stone-100 shadow-sm hover:border-emerald-200 transition-all text-left w-full group relative overflow-hidden"
    >
      <div className="flex justify-between items-start mb-3">
        <div className="max-w-[70%]">
          <h3 className="text-lg font-bold text-stone-900 leading-tight truncate">
            {site.name}
          </h3>
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
            {site.address}
          </p>
        </div>
        <span className="text-3xl">
          {getWeatherIcon(current?.weather_code || 0)}
        </span>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <span className="text-4xl font-black text-stone-900 tracking-tighter">
          {current ? Math.round(current.temperature_2m) : "--"}°
        </span>
        <div className="flex flex-col text-[10px] font-bold text-stone-400">
          <span>
            H: {daily ? Math.round(daily.temperature_2m_max[0]) : "--"}°
          </span>
          <span>
            L: {daily ? Math.round(daily.temperature_2m_min[0]) : "--"}°
          </span>
        </div>
      </div>

      {/* COMPACT DATA GRID */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-stone-50">
        <div className="flex flex-col">
          <span className="text-[9px] font-black text-stone-300 uppercase">
            Rain
          </span>
          <span className="text-xs font-bold text-blue-500">
            {daily?.rain_sum[0] || 0}mm
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] font-black text-stone-300 uppercase">
            Wind
          </span>
          <span className="text-xs font-bold text-stone-700">
            {current?.wind_speed_10m || 0}kph
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] font-black text-stone-300 uppercase">
            Humid
          </span>
          <span className="text-xs font-bold text-stone-700">
            {current?.relative_humidity_2m || 0}%
          </span>
        </div>
      </div>
    </button>
  );
};
