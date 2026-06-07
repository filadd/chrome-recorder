const GATEWAY_BASE = "https://gateway.filadd.com/api";

interface InboxSessionDto {
  id: number;
  start_time: string;
  user_data?: { fullname?: string; name?: string; last_name?: string };
}

export interface InboxSession {
  id: number;
  startTime: Date;
  studentName: string;
}

// scheduler-api serializes naive UTC datetimes (no offset marker).
const parseUtc = (value: string): Date =>
  new Date(/Z|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);

const studentName = (dto: InboxSessionDto): string =>
  dto.user_data?.fullname ??
  [dto.user_data?.name, dto.user_data?.last_name].filter(Boolean).join(" ");

// Today's sessions for the logged-in orientador (own + invited as guest); the
// gateway resolves the JWT to the user and scheduler-api matches their email
// to a CalendlyAccount. `token` is the full "Bearer <jwt>" cookie value.
export const fetchTodaySessions = async (token: string): Promise<InboxSession[]> => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  // Naive ISO strings — scheduler-api parses them with datetime.fromisoformat.
  const params = new URLSearchParams({
    utc_start_datetime: start.toISOString().slice(0, 19),
    utc_end_datetime: end.toISOString().slice(0, 19),
  });

  const response = await fetch(`${GATEWAY_BASE}/scheduler/session/inbox/?${params}`, {
    headers: { Authorization: token },
  });

  if (!response.ok) {
    throw new Error(`Session inbox request failed: ${response.status}`);
  }

  const sessions = (await response.json()) as InboxSessionDto[];

  return sessions
    .map((dto) => ({ id: dto.id, startTime: parseUtc(dto.start_time), studentName: studentName(dto) }))
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
};
