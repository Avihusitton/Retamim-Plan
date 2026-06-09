export const printWithCloneNode = () => {
  // Save current scroll pos
  const scrollPos = window.scrollY;

  // Clone body content to a wrapper, but append it inside a special print-only container
  const printRoot = document.createElement('div');
  printRoot.id = 'print-root';
  printRoot.className = 'print-only bg-desert-100 min-h-screen';

  // Clone the current App container
  const appNode = document.getElementById('root').cloneNode(true);
  printRoot.appendChild(appNode);

  document.body.appendChild(printRoot);

  // Trigger print
  window.print();

  // Cleanup
  document.body.removeChild(printRoot);

  // Restore scroll
  window.scrollTo(0, scrollPos);
};
