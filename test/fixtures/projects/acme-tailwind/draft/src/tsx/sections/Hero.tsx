import { Button, Card } from '@kit';

export function Hero(_props: { state: string }) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Plan your week</h1>
      <Card className="flex flex-col gap-3">
        <p className="text-sm">Pick a day and add the first task.</p>
        <div className="flex gap-2">
          <Button>Add task</Button>
          <Button variant="outline" size="sm">
            See plan
          </Button>
        </div>
      </Card>
    </div>
  );
}
