import { useEffect, useState } from 'react';
import type { Card } from '@sabitori/core';
import { useApp } from '../app-context';
import { exampleById } from '../lib/examples';
import { buildInput } from '../lib/open';
import { navigate } from '../lib/router';
import { todayIso } from '../lib/format';
import { CardScreen } from './Card';

/** A practice message: analysed like any other, never stored in history. */
export function ExampleRoute({ id }: { id: string }) {
  const { engine } = useApp();
  const [card, setCard] = useState<Card | null>(null);
  useEffect(() => {
    const ex = exampleById(id);
    if (!ex) { navigate('/practice', { replace: true }); return; }
    let live = true;
    const today = todayIso(engine.region.timezone);
    const { text, sender } = ex.build(new Date(today + 'T00:00:00Z'));
    void engine.analyze(buildInput(text, 'paste', engine.region.code, sender, today)).then((c) => live && setCard(c));
    return () => { live = false; };
  }, [engine, id]);
  return card ? <CardScreen card={card} example /> : null;
}
