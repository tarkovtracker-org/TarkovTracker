import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TeamCard from '@/features/team/TeamCard.vue';
describe('TeamCard', () => {
  it('renders its title, subtitle, icon, content, and header actions', () => {
    const wrapper = mount(TeamCard, {
      props: { subtitle: 'Manage the team', title: 'Team settings' },
      slots: {
        default: '<p data-testid="content">Team content</p>',
        icon: '<span data-testid="icon">Icon</span>',
        'header-actions': '<button data-testid="header-action">Action</button>',
      },
    });
    expect(wrapper.find('section').exists()).toBe(true);
    expect(wrapper.find('h2').text()).toBe('Team settings');
    expect(wrapper.find('p').text()).toBe('Manage the team');
    expect(wrapper.find('[data-testid="icon"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="header-action"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('omits optional subtitle and header actions when they are not provided', () => {
    const wrapper = mount(TeamCard, {
      props: { title: 'Team settings' },
      slots: { default: 'Team content' },
    });
    expect(wrapper.find('p').exists()).toBe(false);
    expect(wrapper.find('[data-testid="header-action"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
