import { useParams } from "react-router-dom";

function TicketPage(): JSX.Element {
  const { name, id } = useParams<{ name: string; id: string }>();
  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
      Ticket {name}-{id} - coming soon
    </div>
  );
}

export default TicketPage;
