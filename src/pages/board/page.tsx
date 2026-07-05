import { useParams } from "react-router-dom";

function BoardPage(): JSX.Element {
  const { name } = useParams<{ name: string }>();
  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
      Board &quot;{name ?? "?"}&quot; - coming soon
    </div>
  );
}

export default BoardPage;
