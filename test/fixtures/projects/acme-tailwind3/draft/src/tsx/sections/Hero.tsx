import { Button, Card } from '@kit';

export function Hero(_props: { state: string }) {
  return (
    <div className="flex flex-col gap-4 p-6 tablet:flex-row">
      <h1 className="text-2xl font-semibold">Plan your week</h1>
      <Card className="flex flex-col gap-3 edge-dashed dark:bg-brand">
        <p className="text-sm">Pick a day and add the first task.</p>
        <div className="flex gap-2">
          <Button>Add task</Button>
          <Button variant="brand" size="sm">
            See plan
          </Button>
        </div>
      </Card>
    </div>
  );
}
