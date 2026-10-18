import { interpretPuntRoles, normalizePunt, PuntSourcePlay } from './core';
import observed from './core/fixtures/observed.json';
import synthetic from './core/fixtures/synthetic.json';

describe('pinned punting core fixture parity', () => {
  test.each([...observed, ...synthetic])('$name', (fixture) => {
    const source: PuntSourcePlay = fixture.source;
    const event = normalizePunt(source);
    expect(event).toMatchObject(fixture.expected);
    expect(event?.playId).toBe(source.id);
    expect(event?.driveId).toBe(source.driveId);
  });

  test('duplicate roles collapse and conflicting athletes do not suppress team facts', () => {
    const event = normalizePunt(synthetic[0].source);
    if (!event) throw new Error('Expected punt');
    const athleteId = '90071992547409935';
    const row = { playId: event.playId, athleteId, statTypeId: 16, stat: 50 };
    const evidence = { punter: { athleteId, status: 'matched' as const } };
    expect(interpretPuntRoles(event, [row, row], evidence).punter).toEqual({
      athleteId,
      attempt: null,
      yards: 50,
      status: 'matched',
    });
    expect(
      interpretPuntRoles(
        event,
        [row, { ...row, athleteId: 'different' }],
        evidence,
      ).punter.status,
    ).toBe('conflict');
    expect(event.puntYards).toBe(50);
  });
});
