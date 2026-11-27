// A component as a plain class and a metadata object; the template and the styles are its own files.
export const buttonMetadata = {
  selector: 'acme-button',
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.css'],
};

export class ButtonComponent {
  variant: 'primary' | 'quiet' = 'primary';
  disabled = false;
}
