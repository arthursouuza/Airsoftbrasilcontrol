"""Valida destinos do Auth sem enviar e-mail nem consumir confirmação real."""
import urllib.error
import urllib.parse
import urllib.request

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

opener = urllib.request.build_opener(NoRedirect())
site = 'https://arthursouuza.github.io/Airsoftbrasilcontrol/'
callback = site + 'auth-callback.html'
for label, extra, expected in [('Site URL', {}, site),
                               ('Redirect URL', {'redirect_to': callback}, callback)]:
    query = urllib.parse.urlencode({'token': 'invalid-token-for-redirect-validation',
                                    'type': 'signup', **extra})
    url = 'https://nzgpceglyxwtukrbdkam.supabase.co/auth/v1/verify?' + query
    try:
        with opener.open(url, timeout=20) as response:
            raise AssertionError(f'{label}: redirecionamento não observado')
    except urllib.error.HTTPError as error:
        assert error.code in (302, 303), (label, error.code)
        parsed = urllib.parse.urlsplit(error.headers.get('Location', ''))
        actual = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, '', ''))
        assert actual == expected, (label, actual)
        print('PASS', label, actual)
