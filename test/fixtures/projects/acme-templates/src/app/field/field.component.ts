// A component as a plain class and a metadata object; the template and the styles are its own files.
export const fieldMetadata = {
  selector: 'acme-field',
  templateUrl: './field.component.html',
  styleUrls: ['./field.component.css'],
};

export class FieldComponent {
  label = '';
  name = '';
  placeholder = '';
  value = '';
}
