import { Button } from '../components/Button.tsx';
import { Card } from '../components/Card.tsx';

export function Home() {
  return (
    <main>
      <Card title="Welcome">
        <p>Pick a plan to get started.</p>
        <Button>Choose a plan</Button>
      </Card>
    </main>
  );
}
