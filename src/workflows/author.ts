// no confirm prompt here; callers control return/exit behavior
import { exec, commandExists } from '../utils/exec.js'
import { colors } from '../utils/colors.js'
import { select } from '../cli/menu.js'

/** Simple author tools menu. Shows Geeto developer information. */
export const showAuthorTools = async (): Promise<void> => {
  // Geeto developer information
  const geetoAuthor = {
    name: 'Agung Maulana Malik',
    email: 'amdev142@gmail.com',
    url: 'https://github.com/rust142',
  }

  const githubProfile = 'https://github.com/rust142'
  const saweriaUrl = 'https://saweria.co/rust142'
  const linkedinUrl = 'https://www.linkedin.com/in/agungid/'
  const whatsappNumber = '+6283842741577'

  console.log(
    `${colors.cyan}┌─ About Author ──────────────────────────────────────────┐${colors.reset}`
  )

  console.log(
    `${colors.cyan}│${colors.reset} Author: ${colors.cyan}${geetoAuthor.name}${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset} Email: ${colors.cyan}${geetoAuthor.email}${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset} WhatsApp: ${colors.cyan}${whatsappNumber}${colors.reset}`
  )

  console.log(
    `${colors.cyan}└─────────────────────────────────────────────────────────┘${colors.reset}`
  )

  const choice = await select('What would you like to do?', [
    { label: 'Open GitHub profile', value: 'open_github' },
    { label: 'Open Saweria (Support author)', value: 'open_saweria' },
    { label: 'Open LinkedIn (Connect with author)', value: 'open_linkedin' },
    { label: 'Print all URLs', value: 'print_all' },
    { label: 'Back to main menu', value: 'back' },
  ])

  let opener: string | null = null
  if (commandExists('open')) {
    opener = 'open'
  } else if (commandExists('xdg-open')) {
    opener = 'xdg-open'
  }

  const openUrl = (url: string) => {
    if (opener) {
      try {
        exec(`${opener} ${url}`)
      } catch {
        console.log('Could not open browser.')
      }
      return
    }
    console.log('No system opener available; copy the URL manually:')
    console.log(url)
  }

  switch (choice) {
    case 'open_github': {
      openUrl(githubProfile)
      break
    }
    case 'open_saweria': {
      openUrl(saweriaUrl)
      break
    }
    case 'open_linkedin': {
      openUrl(linkedinUrl)
      break
    }
    case 'print_all': {
      console.log('GitHub:', githubProfile)
      console.log('Saweria:', saweriaUrl)
      console.log('LinkedIn:', linkedinUrl)
      break
    }
    case 'back': {
      // Return to caller (main menu)
      return
    }
    default: {
      break
    }
  }

  // Return to caller (main menu)
  return
}

export default showAuthorTools
