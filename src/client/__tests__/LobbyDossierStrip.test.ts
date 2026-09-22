import { describe, it, expect } from 'vitest';
import { renderLobbyDossierStrip } from '../ui/components/LobbyDossier';
import { es, skillName } from '../../strings/es';

describe('renderLobbyDossierStrip', () => {
  it('names the survivor and its role', () => {
    const html = renderLobbyDossierStrip('Wanda', 'Camarera');

    expect(html).toContain('Wanda');
    expect(html).toContain('Camarera');
  });

  it('reads type and health off the definition', () => {
    const classic = renderLobbyDossierStrip('Wanda', 'Camarera');
    const kid = renderLobbyDossierStrip('Lili', 'Francotiradora');

    expect(classic).toContain(es.lobby.survivorType.Classic);
    expect(classic).toContain(es.lobby.health(3));
    expect(kid).toContain(es.lobby.survivorType.Kid);
    expect(kid).toContain(es.lobby.health(2));
  });

  it('shows the skill the survivor starts with', () => {
    const html = renderLobbyDossierStrip('Wanda', 'Camarera');

    // Wanda opens at Blue with Sprint (SURVIVOR_CLASSES).
    expect(html).toContain(skillName('sprint'));
  });

  it('offers the full tree without opening it', () => {
    const html = renderLobbyDossierStrip('Wanda', 'Camarera');

    expect(html).toContain('data-action="open-dossier"');
    expect(html).toContain('data-id="Wanda"');
    expect(html).toContain(es.lobby.dossierMore);
  });

  it('renders nothing for a survivor the registry does not know', () => {
    expect(renderLobbyDossierStrip('Nobody', 'Camarera')).toBe('');
  });

  it('escapes a role it is handed', () => {
    const html = renderLobbyDossierStrip('Wanda', '<img src=x onerror=1>');

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
