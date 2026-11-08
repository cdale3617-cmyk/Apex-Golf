import type { PlayingState } from './round-state';
import type { CaddiePlan } from './strategy';

/** The same short briefing is displayed and spoken for the current shot. */
export function caddieCall(plan: CaddiePlan, playing: PlayingState): string {
  if(plan.status==='Check the hole and marker positions')return 'The ball or yellow target is outside this mapped hole. Reset the yellow target and check your ball position before choosing a club.';
  if (playing.lie === 'Green') return 'Putter. Read the slope and pace, then pick your starting line.';
  if (!plan.advice) return 'Set your ball position first. Use GPS, mark the ball on the map, or tell me the remaining distance.';
  const line = (label: string) => plan.advice!.lines.find(item => item.label === label)?.text;
  const call = line('Plan') ?? line('Club');
  const parts = [
    line('Hazards'),
    playing.lie === 'Unknown' ? 'Confirm your lie before committing to this shot.' : null,
    call,
    plan.advice.club ? line('Plays like') : null,
    plan.warnings.find(warning => warning.includes('hazard clearance')),
    plan.advice.club ? 'Pick your landing spot. Commit to the club and keep a smooth tempo.' : null,
  ];
  return parts.filter(Boolean).join(' ');
}
