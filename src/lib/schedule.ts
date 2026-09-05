export type ShiftDay = {
  date: string;
  day: number;
  weekday: string;
  isWorkDay: boolean;
};

export function generateTwoByTwoSchedule(monthValue: string, firstWorkDay: string): ShiftDay[] {
  const [year, month] = monthValue.split("-").map(Number);
  const firstDate = new Date(year, month - 1, 1);
  const lastDate = new Date(year, month, 0);
  const baseDate = parseDate(firstWorkDay);

  return Array.from({ length: lastDate.getDate() }, (_, index) => {
    const date = new Date(firstDate);
    date.setDate(index + 1);

    const diffDays = Math.floor((startOfDay(date).getTime() - startOfDay(baseDate).getTime()) / 86400000);
    const cycleDay = ((diffDays % 4) + 4) % 4;
    const isWorkDay = cycleDay === 0 || cycleDay === 1;

    return {
      date: toDateInputValue(date),
      day: date.getDate(),
      weekday: date.toLocaleDateString("es-CO", { weekday: "short" }),
      isWorkDay
    };
  });
}

export function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}
