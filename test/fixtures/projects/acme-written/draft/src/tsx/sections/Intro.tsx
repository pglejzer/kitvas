import { Button, Card, Heading } from '@kit';

export function Intro(_props: { state: string }) {
  return (
    <div className="intro">
      <Heading>Choose a plan</Heading>
      <Card title="Starter plan">For one person.</Card>
      <Button>Save changes</Button>
    </div>
  );
}
