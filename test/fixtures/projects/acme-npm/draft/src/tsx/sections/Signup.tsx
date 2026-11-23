import { Badge, Button, TextField } from '@kit';

export function Signup(_props: { state: string }) {
  return (
    <div className="signup">
      <h1>Join the Acme newsletter</h1>
      <Badge tone="info">Weekly, no spam</Badge>
      <TextField label="Email address" placeholder="you@example.com" />
      <Button>Subscribe</Button>
    </div>
  );
}
