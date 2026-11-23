import { Button, Card, Stack } from '@kit';

export function Intro(_props: { state: string }) {
  return (
    <div className="intro">
      <h1>Welcome to Firma</h1>
      <Stack>
        <Card title="Your first project">
          <p>Create a project to start tracking orders.</p>
          <Button>Create project</Button>
        </Card>
      </Stack>
    </div>
  );
}
