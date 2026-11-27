// A component as a plain class and a metadata object; the template and the styles are its own files.
export const cardMetadata = {
  selector: 'acme-card',
  templateUrl: './card.component.html',
  styleUrls: ['./card.component.css'],
};

export class CardComponent {
  title = '';
  actionLabel = '';
}
