/**
 * Two sysctls side by side in different units, and a setter that doubles.
 *
 * Socket buffer tuning is a small pile of numbers that all look like the same
 * kind of number and are not. Four things make it wrong more often than not,
 * and all four were measured on the host this was written on.
 *
 * FIRST: net.ipv4.tcp_mem is in PAGES. Its neighbors tcp_rmem and tcp_wmem
 * are in bytes. Nothing in the names says so and nothing warns you. This
 * host reports
 *
 *     net.ipv4.tcp_mem    191742  255659  383484
 *
 * which as pages is 0.73, 0.98 and 1.46 GiB, the last being 9.3 percent of
 * the machine's memory: a number somebody chose. Read as bytes it is 0.4 MiB,
 * which is 0.0023 percent, and is not a number anybody would choose. The
 * arithmetic is the tell. /proc/net/sockstat's mem column is in pages too.
 *
 * SECOND: the default you read is not doubled, and the value you set is.
 * A fresh socket reports exactly tcp_rmem[1]:
 *
 *     fresh socket SO_RCVBUF 131072, tcp_rmem default 131072, ratio 1.0
 *     setting that same 131072 reads back 262144, ratio 2.0
 *
 * The doubling is in sock_setsockopt, which stores 2 * the requested value so
 * that half the buffer can be spent on sk_buff overhead rather than payload.
 * Reading before and after a change therefore shows a doubling that looks
 * like the kernel rounding up to the default, and is not.
 *
 * THIRD: it is clamped silently. Asking for four times net.core.rmem_max
 * came back as exactly two times it, with no error:
 *
 *     asked 16777216 (16 MiB), got 8388608 (8 MiB) = 2 * rmem_max
 *
 * setsockopt returned success. A program that checks the return value and
 * not the value learns nothing.
 *
 * FOURTH, AND THE ONE THAT COSTS THROUGHPUT: setting SO_RCVBUF turns
 * autotuning off for the life of the socket, and autotuning is allowed to go
 * further than you are. This host:
 *
 *     net.ipv4.tcp_rmem  4096  131072  33554432     autotuning may reach 32 MiB
 *     net.core.rmem_max               4194304       SO_RCVBUF caps at 2x this, 8 MiB
 *
 * So a socket somebody tuned tops out four times smaller than one nobody
 * touched, and the tuning is what did it. The two ceilings are different
 * sysctls, they are commonly left at different values, and the one that
 * applies depends on whether the program called setsockopt.
 *
 * Not modeled: the write side's separate accounting through sk_wmem_queued
 * and tcp_wmem, which has the same shape; SO_RCVBUFFORCE, which lets
 * CAP_NET_ADMIN past rmem_max; tcp_adv_win_scale, which decides how much of
 * the buffer is advertised as window rather than kept for overhead; and the
 * pressure state machine between tcp_mem's three marks, which throttles
 * allocation rather than refusing it.
 */

export interface Setup {
  /** The host, so the rendered sysctls name something. */
  host: string;
  /** Physical memory in whole GiB, which is what the tcp_mem defaults track. */
  ramGiB: number;
  /** net.ipv4.tcp_mem, in PAGES: low, pressure, high. */
  tcpMemPages: [number, number, number];
  /** net.ipv4.tcp_rmem, in BYTES: min, default, max. */
  tcpRmem: [number, number, number];
  /** net.core.rmem_max, in bytes: the ceiling on what SO_RCVBUF may ask for. */
  rmemMax: number;
  /** What the program passes to setsockopt, or null if it never calls it. */
  asks: number | null;
  /** Sockets the workload holds open at once. */
  sockets: number;
  /** Pages of socket memory already charged across the machine. */
  chargedPages: number;
}

export type Claim =
  /** What getsockopt reports back after whatever the program did. */
  | { about: "reported"; bytes: number }
  /** The largest this socket's receive buffer can ever become. */
  | { about: "ceiling"; bytes: number }
  /** Whether autotuning is still running on this socket. */
  | { about: "autotuning"; value: boolean }
  /** Whether tuning made the ceiling smaller than leaving it alone would have. */
  | { about: "backfired"; value: boolean }
  /** tcp_mem's high mark expressed in gibibytes. */
  | { about: "high-mark-gib"; value: number }
  /** Which pressure band the machine's socket memory currently sits in. */
  | { about: "band"; name: string }
  /** A claim about something this model does not decide. It never holds. */
  | { about: "nothing" };

export interface Option {
  id: string;
  claim: string;
  says: Claim;
}

export interface Case {
  slug: string;
  name: string;
  brief: string;
  setup: Setup;
  question: string;
  options: Option[];
  why: string;
  fix: string;
  /** The belief this case breaks. Unique across the set. */
  breaks: string;
}
